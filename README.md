# Repository of a plugin for BigBlueButton

## Description

Display a word cloud formed with the words said in chat.

## Next steps

* [ ] Option to enable and disable the plugin (right now it replaces the presentation area and you can't change it)
* [ ] Clear the word cloud when the chat is cleared or add an option for the presenter to do so
* [ ] Better way to start a new cloud (replace the command `/cloud`)
* [ ] Synchronize the cloud between all participants (at the moment each client renders its own cloud)
* [ ] Don't need to re-render the cloud every time a resize is triggered, this can be improved
* [ ] This plugin can become a bigger one: collect input from users (not only from chat, there are several options) and display them (not only as a word cloud, there are many ways to show data visually)

## Building the Plugin

To build the plugin for production use, follow these steps:

```bash
cd $HOME/src/plugin-template
npm ci
npm run build-bundle
```

The above command will generate the `dist` folder, containing the bundled JavaScript file named `<plugin-name>.js`. This file can be hosted on any HTTPS server along with its `manifest.json`.

If you install the Plugin separated to the manifest, remember to change the `javascriptEntrypointUrl` in the `manifest.json` to the correct endpoint.

To use the plugin in BigBlueButton, send this parameter along in create call:

```
pluginManifests=[{"url":"<your-domain>/path/to/manifest.json"}]
```

Or additionally, you can add this same configuration in the `.properties` file from `bbb-web` in `/usr/share/bbb-web/WEB-INF/classes/bigbluebutton.properties`


## Development mode

As for development mode (running this plugin from source), please, refer back to https://github.com/bigbluebutton/bigbluebutton-html-plugin-sdk section `Running the Plugin from Source`
