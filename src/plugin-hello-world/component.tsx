import { BbbPluginSdk, OptionsDropdownOption, pluginLogger } from 'bigbluebutton-html-plugin-sdk';
import * as React from 'react';
import { useEffect } from 'react';

interface PluginHelloWorldProps {
  pluginUuid: string;
}

function PluginHelloWorld(
  { pluginUuid }: PluginHelloWorldProps,
): React.ReactElement<PluginHelloWorldProps> {
  BbbPluginSdk.initialize(pluginUuid);
  const pluginApi = BbbPluginSdk.getPluginApi(pluginUuid);

  useEffect(() => {
    pluginApi.setOptionsDropdownItems([
      new OptionsDropdownOption({
        label: 'Click me',
        icon: 'user',
        onClick: () => {
          alert('hello wrold');
          pluginLogger.info('Option has been clicked');
        },
      }),
    ]);
  }, []);

  return null;
}
export default PluginHelloWorld;
