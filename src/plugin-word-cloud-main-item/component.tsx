import * as React from 'react';
import { useEffect } from 'react';

import {
  BbbPluginSdk,
  PluginApi,
  GenericContentMainArea,
} from 'bigbluebutton-html-plugin-sdk';
import * as ReactDOM from 'react-dom/client';
import { PluginWordCloudMainItemProps } from './types';
import { PluginWordCloud } from '../plugin-word-cloud/component';

function SampleGenericContentMainPlugin(
  { pluginUuid: uuid }: PluginWordCloudMainItemProps,
): React.ReactNode {
  BbbPluginSdk.initialize(uuid);
  const pluginApi: PluginApi = BbbPluginSdk.getPluginApi(uuid);

  useEffect(() => {
    pluginApi.setGenericContentItems([
      new GenericContentMainArea({
        contentFunction: (element: HTMLElement) => {
          const root = ReactDOM.createRoot(element);
          root.render(
            <React.StrictMode>
              <PluginWordCloud
                pluginUuid={uuid}
              />
            </React.StrictMode>,
          );
          return root;
        },
      }),
    ]);
  }, []);

  return null;
}

export default SampleGenericContentMainPlugin;
