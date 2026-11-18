
import { 
    getLicenseInfo
} from '../../persistence/graphql/GraphQLPersistence';
import {
    LICENSE_TYPES
} from '../LicensedFeatures';
import { getDynamicConfigValue } from '../../dynamicConfig';

export const getEulaFile = async () => {
    if (getDynamicConfigValue('REACT_APP_AUTH_METHOD') === 'proxy') {
      const response = await fetch('/backoffice/cypher-workbench/license', { credentials: 'same-origin' });
      if (!response.ok) throw new Error(`License unavailable: ${response.status}`);
      const license = await response.json();
      if (!license.type || license.type.startsWith('Cloud_')) throw new Error('Managed license is not eligible');
      return license.type === LICENSE_TYPES.Basic ? 'CypherWorkbenchEULA_Basic.html' :
        license.type === LICENSE_TYPES.Enterprise ? 'CypherWorkbenchEULA_Enterprise.html' :
        license.type === LICENSE_TYPES.EnterpriseTrial ? 'CypherWorkbenchEULA_EnterpriseTrial.html' :
        'CypherWorkbenchEULA.html';
    }
    var licenseInfo = await getLicenseInfo();  
    if (licenseInfo.success) {
        licenseInfo = licenseInfo.licenseInfo;

    } else {
      //alert(`Error fetching license info: ${licenseInfo.error}`);
      console.log(`Error fetching license info: ${licenseInfo.error}`);
      return;
    }
    //console.log('licenseInfo: ', licenseInfo);
    var licenseEulaFile = 'CypherWorkbenchEULA.html';
    switch (licenseInfo.type) {
      case LICENSE_TYPES.Basic:
      case LICENSE_TYPES.Cloud_Basic:
        licenseEulaFile = 'CypherWorkbenchEULA_Basic.html'
        //console.log('promise resolving License file is: ', licenseEulaFile);
        break;
      case LICENSE_TYPES.Enterprise:
      case LICENSE_TYPES.Cloud_Enterprise:
        licenseEulaFile = 'CypherWorkbenchEULA_Enterprise.html'
        //console.log('promise resolving License file is: ', licenseEulaFile);
        break;
      case LICENSE_TYPES.EnterpriseTrial:
      case LICENSE_TYPES.Cloud_EnterpriseTrial:
        licenseEulaFile = 'CypherWorkbenchEULA_EnterpriseTrial.html'
        //console.log('promise resolving License file is: ', licenseEulaFile);
        break;
      }
  //console.log('License file is: ', licenseEulaFile);
  return licenseEulaFile;
}