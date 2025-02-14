import { Hono } from '@hono/hono'

import * as utils from "../utils/common.ts";
import * as acquisitionUtils from "../utils/acquisition.ts";
import { UpdateCheckCacheResponse, UpdateCheckRequest, UpdateCheckResponse } from "../types/rest-definitions.ts";
import * as validationUtils from "../utils/validation.ts";
import * as rolloutSelector from "../utils/rollout-selector.ts";
import { createClient } from "@supabase/supabase";

const supabase = createClient(
  Deno.env.get('SUPABASE_URL'),
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
);

const functionName = 'breakroom-code-push'
const app = new Hono().basePath(`/${functionName}`)


const updateCheck = async ( c: any ) => {
      const clientUniqueId: string = String(c.req.query.clientUniqueId || c.req.query.client_unique_id);
      const deploymentKey: string = String(c.req.query.deploymentKey || c.req.query.deployment_key);
      const appVersion: string = String(c.req.query.appVersion || c.req.query.app_version);
      const packageHash: string = String(c.req.query.packageHash || c.req.query.package_hash);
      const isCompanion: string = String(c.req.query.isCompanion || c.req.query.is_companion);
    
      const updateRequest: UpdateCheckRequest = {
        deploymentKey: deploymentKey,
        appVersion: appVersion,
        packageHash: packageHash,
        isCompanion: isCompanion && isCompanion.toLowerCase() === "true",
        label: String(c.req.query.label),
      };
    
      let originalAppVersion: string;
    
      // Make an exception to allow plain integer numbers e.g. "1", "2" etc.
      const isPlainIntegerNumber: boolean = /^\d+$/.test(updateRequest.appVersion);
      if (isPlainIntegerNumber) {
        originalAppVersion = updateRequest.appVersion;
        updateRequest.appVersion = originalAppVersion + ".0.0";
      }
    
      // Make an exception to allow missing patch versions e.g. "2.0" or "2.0-prerelease"
      const isMissingPatchVersion: boolean = /^\d+\.\d+([\+\-].*)?$/.test(updateRequest.appVersion);
      if (isMissingPatchVersion) {
        originalAppVersion = updateRequest.appVersion;
        const semverTagIndex = originalAppVersion.search(/[\+\-]/);
        if (semverTagIndex === -1) {
          updateRequest.appVersion += ".0";
        } else {
          updateRequest.appVersion = originalAppVersion.slice(0, semverTagIndex) + ".0" + originalAppVersion.slice(semverTagIndex);
        }
      }

      if (!validationUtils.isValidUpdateCheckRequest(updateRequest)) {
        if (!validationUtils.isValidKeyField(updateRequest.deploymentKey)) {
          return new Response(
            "An update check must include a valid deployment key - please check that your app has been " +
              "configured correctly. To view available deployment keys, run 'code-push-standalone deployment ls <appName> -k'.",
              {status: 400}
          )
        } else if (!validationUtils.isValidAppVersionField(updateRequest.appVersion)) {
          return new Response(
            "An update check must include a binary version that conforms to the semver standard (e.g. '1.0.0'). " +
              "The binary version is normally inferred from the App Store/Play Store version configured with your app.",
              {status: 400}
          )
        } else {
          return new Response(
            "An update check must include a valid deployment key and provide a semver-compliant app version.", {status: 400}
          )
        }  

      }

      // supabase. get deployments histories
      const { data: packageHistory, error } =  await supabase.from("code_push_package")
        .select(`
            appVersion:app_version,
            blobUrl:blob_url,
            description:description,
            isDisabled: is_disabled,
            isMandatory:is_mandatory,
            manifestBlobUrl: manifest_blob_url,
            packageHash: package_hash.
            rollout:rollout,
            size:size
        `)
        .eq('deployment_key', updateRequest.deploymentKey)
      console.log(packageHistory)

      const updateObject: UpdateCheckCacheResponse = acquisitionUtils.getUpdatePackageInfo(packageHistory, updateRequest);
        if ((isMissingPatchVersion || isPlainIntegerNumber) && updateObject.originalPackage.appVersion === updateRequest.appVersion) {
          // Set the appVersion of the response to the original one with the missing patch version or plain number
          updateObject.originalPackage.appVersion = originalAppVersion;
          if (updateObject.rolloutPackage) {
            updateObject.rolloutPackage.appVersion = originalAppVersion;
          }
        }

      let giveRolloutPackage: boolean = false;
      const cachedResponseObject = <UpdateCheckCacheResponse>updateObject;
      if (cachedResponseObject.rolloutPackage && clientUniqueId) {
        const releaseSpecificString: string =
          cachedResponseObject.rolloutPackage.label || cachedResponseObject.rolloutPackage.packageHash;
        giveRolloutPackage = rolloutSelector.isSelectedForRollout(
          clientUniqueId,
          cachedResponseObject.rollout,
          releaseSpecificString
        );
      }

      const updateCheckBody: { updateInfo: UpdateCheckResponse } = {
        updateInfo: giveRolloutPackage ? cachedResponseObject.rolloutPackage : cachedResponseObject.originalPackage,
      };

      // Change in new API
      updateCheckBody.updateInfo.target_binary_range = updateCheckBody.updateInfo.appVersion;
      return new Response(JSON.stringify(utils.convertObjectToSnakeCase(updateCheckBody)), {status: 200})
    };


  const reportStatusDeploy = async (c: any) => {
    if (c.req.method === 'OPTIONS') {
      return new Response('ok', {status: 204, headers: {
        'Access-Control-Allow-Origin': '*',
        "Access-Control-Allow-Methods": "GET, POST, DELETE, PUT",
        'Access-Control-Allow-Headers': "Content-Type, X-CodePush-Plugin-Name, X-CodePush-Plugin-Version, X-CodePush-SDK-Version",
        "Cache-Control": "no-cache"
      }});
    }

    const body = await c.req.json()
    const deploymentKey = body.deploymentKey || body.deployment_key;
    const appVersion = body.appVersion || body.app_version;
    const clientUniqueId = body.clientUniqueId || body.client_unique_id;

    if (!deploymentKey || !appVersion) {
      return new Response('A deploy status report must contain a valid appVersion and deploymentKey.', {status: 400})
    } else if (body.label) {
      if (!body.status) {
        return new Response('A deploy status report for a labelled package must contain a valid status.', {status: 400})
      } else if (!utils.isValidDeploymentStatus(body.status)) {
        return new Response("Invalid status: " + body.status, {status: 400})
      }
    }

    console.log("reportStatusDeploy:", deploymentKey, clientUniqueId, appVersion, body.label, body.status)
    return new Response('OK', {status: 200})
  };

  const reportStatusDownload = async (c: any) => {
    if (c.req.method === 'OPTIONS') {
      return new Response('ok', {status: 204, headers: {
        'Access-Control-Allow-Origin': '*',
        "Access-Control-Allow-Methods": "GET, POST, DELETE, PUT",
        'Access-Control-Allow-Headers': "Content-Type, X-CodePush-Plugin-Name, X-CodePush-Plugin-Version, X-CodePush-SDK-Version",
        "Cache-Control": "no-cache"
      }});
    }
    const body = await c.req.json()
    const deploymentKey = body.deploymentKey || body.deployment_key;
    if (!body || !deploymentKey || !body.label) {
      return new Response('A download status report must contain a valid deploymentKey and package label.', {status: 400})
    }
    console.log("deploymentKey download", deploymentKey)

    return new Response('OK', {status: 200})
  };


app.get('/v0.1/public/codepush/update_check', updateCheck)
app.post('/v0.1/public/codepush/report_status/deploy', reportStatusDeploy)
app.post('/v0.1/public/codepush/report_status/download', reportStatusDownload)
  
Deno.serve(app.fetch);