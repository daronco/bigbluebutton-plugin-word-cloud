import * as React from 'react';
import * as ReactDOM from 'react-dom/client';
import PluginHelloWorld from './plugin-hello-world/component';

const uuid = document.currentScript?.getAttribute('uuid') || 'root';

const pluginName = document.currentScript?.getAttribute('pluginName') || 'plugin';

const root = ReactDOM.createRoot(document.getElementById(uuid));
root.render(
  <PluginHelloWorld {...{
    pluginUuid: uuid,
    pluginName,
  }}
  />
);
