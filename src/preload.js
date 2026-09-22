const {
  contextBridge,
  ipcRenderer
} = require('electron');

contextBridge.exposeInMainWorld(
  'captionChaos',
  {

    /* =====================================================
       DISCORD
    ===================================================== */

    connectDiscord: () =>
      ipcRenderer.invoke(
        'discord-connect'
      ),

    onDiscordUser: (callback) => {

      if (
        typeof callback !== 'function'
      ) {
        return;
      }

      ipcRenderer.on(
        'discord-user',
        (_event, user) => {
          callback(user);
        }
      );

    },

    onDiscordError: (callback) => {

      if (
        typeof callback !== 'function'
      ) {
        return;
      }

      ipcRenderer.on(
        'discord-error',
        (_event, message) => {
          callback(message);
        }
      );

    }

  }
);