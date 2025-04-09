import * as React from 'react';
import * as ReactDOM from 'react-dom/client';
import PluginWordCloud from './plugin-word-cloud/component'; // Path updated for rename

const uuid = document.currentScript?.getAttribute('uuid') || 'root';

const pluginName = document.currentScript?.getAttribute('pluginName') || 'plugin';

const root = ReactDOM.createRoot(document.getElementById(uuid));
root.render(
  <PluginWordCloud {...{ // Component name updated
    pluginUuid: uuid,
    pluginName,
  }}
  />
);
