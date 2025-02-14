// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

function toSnakeCase(str: string): string {
  return str
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .toLowerCase();
}

export function convertObjectToSnakeCase(obj: any): any {
  if (typeof obj !== "object" || obj === null) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item: any) => convertObjectToSnakeCase(item));
  }

  return Object.keys(obj).reduce((acc, key) => {
    const snakeCaseKey: string = toSnakeCase(key);
    acc[snakeCaseKey] = convertObjectToSnakeCase(obj[key]);
    return acc;
  }, {} as any);
}


export const DEPLOYMENT_SUCCEEDED = "DeploymentSucceeded";
export const DEPLOYMENT_FAILED = "DeploymentFailed";
export const ACTIVE = "Active";
export const DOWNLOADED = "Downloaded";

export function isValidDeploymentStatus(status: string): boolean {
  return status === DEPLOYMENT_SUCCEEDED || status === DEPLOYMENT_FAILED || status === DOWNLOADED;
}