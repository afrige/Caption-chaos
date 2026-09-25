const {
  app,
  BrowserWindow,
  ipcMain,
  shell
} = require('electron');

const path = require('path');
const http = require('http');
const express = require('express');
const crypto = require('crypto');

const {
  connectDiscord,
  clearPresence
} = require('./discord-presence');

const CLIENT_ID = '1551659614175764561';
const REDIRECT_URI = 'http://127.0.0.1/callback';

let mainWindow = null;
let oauthServer = null;

let oauthState = null;
let codeVerifier = null;

/* =========================================================
   WINDOW
========================================================= */

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 940,
    minWidth: 1180,
    minHeight: 760,

    backgroundColor: '#0a0718',

    icon: path.join(__dirname, '..', 'icon.ico'),

    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.removeMenu();

  mainWindow.loadFile(
    path.join(__dirname, 'index.html')
  );
}

/* =========================================================
   PKCE
========================================================= */

function createCodeVerifier() {
  return crypto
    .randomBytes(64)
    .toString('base64url');
}

function createCodeChallenge(verifier) {
  return crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64url');
}

function createState() {
  return crypto
    .randomBytes(32)
    .toString('hex');
}

/* =========================================================
   DISCORD USER
========================================================= */

async function getDiscordUser(accessToken) {
  const response = await fetch(
    'https://discord.com/api/v10/users/@me',
    {
      method: 'GET',

      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  );

  if (!response.ok) {
    throw new Error(
      `Discord user request failed: ${response.status}`
    );
  }

  return response.json();
}

/* =========================================================
   TOKEN EXCHANGE
========================================================= */

async function exchangeCode(code) {
  if (!codeVerifier) {
    throw new Error(
      'OAuth code verifier is missing.'
    );
  }

  const body = new URLSearchParams();

  body.set(
    'client_id',
    CLIENT_ID
  );

  body.set(
    'grant_type',
    'authorization_code'
  );

  body.set(
    'code',
    code
  );

  body.set(
    'redirect_uri',
    REDIRECT_URI
  );

  body.set(
    'code_verifier',
    codeVerifier
  );

  const response = await fetch(
    'https://discord.com/api/v10/oauth2/token',
    {
      method: 'POST',

      headers: {
        'Content-Type':
          'application/x-www-form-urlencoded'
      },

      body
    }
  );

  const data = await response.json();

  if (!response.ok) {
    console.error(
      '[Caption Chaos] Discord token error:',
      data
    );

    throw new Error(
      data.error_description ||
      data.error ||
      'Discord token exchange failed.'
    );
  }

  return data;
}

/* =========================================================
   OAUTH SERVER
========================================================= */

function startOAuthServer() {
  return new Promise((resolve, reject) => {
    const serverApp = express();

    oauthServer = http.createServer(
      serverApp
    );

    serverApp.get(
      '/callback',
      async (req, res) => {

        const receivedCode =
          req.query.code;

        const receivedState =
          req.query.state;

        if (
          !receivedCode ||
          !receivedState
        ) {
          res.status(400).send(`
            <!doctype html>
            <html>
            <body style="
              background:#060610;
              color:white;
              font-family:Arial;
              text-align:center;
              padding:60px;
            ">
              <h1>Caption Chaos</h1>
              <p>Discord authorization failed.</p>
              <p>You may close this window.</p>
            </body>
            </html>
          `);

          return;
        }

        if (
          receivedState !== oauthState
        ) {
          console.error(
            '[Caption Chaos] Invalid OAuth state.'
          );

          res.status(400).send(`
            <!doctype html>
            <html>
            <body style="
              background:#060610;
              color:white;
              font-family:Arial;
              text-align:center;
              padding:60px;
            ">
              <h1>Caption Chaos</h1>
              <p>Authorization security check failed.</p>
              <p>You may close this window.</p>
            </body>
            </html>
          `);

          return;
        }

        res.send(`
          <!doctype html>
          <html>
          <head>
            <meta charset="UTF-8">
            <title>Caption Chaos</title>
          </head>

          <body style="
            background:#060610;
            color:white;
            font-family:Arial,sans-serif;
            text-align:center;
            padding:70px;
          ">

            <h1 style="
              font-size:32px;
              margin-bottom:12px;
            ">
              Caption Chaos
            </h1>

            <p style="
              opacity:.7;
              font-size:16px;
            ">
              Discord authorization received.
            </p>

            <p style="
              opacity:.45;
              font-size:14px;
            ">
              You may close this window.
            </p>

          </body>
          </html>
        `);

        try {
          const token =
            await exchangeCode(
              receivedCode
            );

          const user =
            await getDiscordUser(
              token.access_token
            );

          const avatarUrl =
            user.avatar
              ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${user.avatar.startsWith('a_') ? 'gif' : 'png'}?size=128`
              : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(user.id) % 5n)}.png`;

          const safeUser = {
            id: user.id,
            username: user.username,
            global_name:
              user.global_name ||
              user.username,
            avatar_url: avatarUrl
          };

          if (
            mainWindow &&
            !mainWindow.isDestroyed()
          ) {
            mainWindow.webContents.send(
              'discord-user',
              safeUser
            );
          }

          console.log(
            `[Caption Chaos] Discord connected: ${safeUser.global_name}`
          );

        } catch (error) {

          console.error(
            '[Caption Chaos] Discord OAuth failed:',
            error
          );

          if (
            mainWindow &&
            !mainWindow.isDestroyed()
          ) {
            mainWindow.webContents.send(
              'discord-error',
              error.message
            );
          }
        }

        oauthState = null;
        codeVerifier = null;
      }
    );

    oauthServer.listen(
      80,
      '127.0.0.1',
      () => {

        console.log(
          '[Caption Chaos] Discord OAuth callback ready.'
        );

        resolve();
      }
    );

    oauthServer.on(
      'error',
      (error) => {
        console.error(
          '[Caption Chaos] OAuth server error:',
          error
        );

        reject(error);
      }
    );
  });
}

/* =========================================================
   DISCORD CONNECT
========================================================= */

ipcMain.handle(
  'discord-connect',
  async () => {

    try {

      codeVerifier =
        createCodeVerifier();

      oauthState =
        createState();

      const codeChallenge =
        createCodeChallenge(
          codeVerifier
        );

      const params =
        new URLSearchParams({
          client_id: CLIENT_ID,

          response_type: 'code',

          redirect_uri:
            REDIRECT_URI,

          scope: 'identify',

          state: oauthState,

          code_challenge:
            codeChallenge,

          code_challenge_method: 'S256'
        });

      const authUrl =
        `https://discord.com/oauth2/authorize?${params.toString()}`;

      await shell.openExternal(
        authUrl
      );

      return {
        success: true
      };

    } catch (error) {

      console.error(
        '[Caption Chaos] Could not open Discord authorization:',
        error
      );

      return {
        success: false,
        error: error.message
      };
    }
  }
);

/* =========================================================
   START
========================================================= */

app.whenReady().then(
  async () => {

    createWindow();

    try {

      await startOAuthServer();

    } catch (error) {

      console.error(
        '[Caption Chaos] Could not start OAuth server:',
        error.message
      );

    }

    await connectDiscord();

    app.on(
      'activate',
      () => {

        if (
          BrowserWindow.getAllWindows()
            .length === 0
        ) {
          createWindow();
        }

      }
    );
  }
);

/* =========================================================
   CLEANUP
========================================================= */

app.on(
  'before-quit',
  async () => {

    await clearPresence();

    if (oauthServer) {
      oauthServer.close();
      oauthServer = null;
    }

  }
);

app.on(
  'window-all-closed',
  () => {

    if (
      process.platform !== 'darwin'
    ) {
      app.quit();
    }

  }
);