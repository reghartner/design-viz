import { createApp } from '@backstage/frontend-defaults';
import catalogPlugin from '@backstage/plugin-catalog/alpha';
import flowviewPlugin from '@flowview/backstage-plugin/new-frontend';
export default createApp({features: [catalogPlugin, flowviewPlugin]});
