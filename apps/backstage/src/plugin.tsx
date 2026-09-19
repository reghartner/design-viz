import {createFrontendPlugin} from '@backstage/frontend-plugin-api';
import {EntityContentBlueprint} from '@backstage/plugin-catalog-react/alpha';

const diagrams=EntityContentBlueprint.make({
  name:'diagrams',
  params:{path:'diagrams',title:'Diagrams',filter:entity=>['component','api'].includes(entity.kind.toLowerCase()),
    loader:()=>import('./EntityFlowviewContent').then(m=><m.EntityFlowviewContent/>)}
});
export const flowviewPlugin=createFrontendPlugin({pluginId:'flowview',extensions:[diagrams]});
