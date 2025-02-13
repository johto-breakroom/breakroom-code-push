export interface BlobInfo {
    size: number;
    url: string;
  }
  
export interface PackageHashToBlobInfoMap {
    [packageHash: string]: BlobInfo;
}

export interface Package {
    appVersion: string;
    blobUrl: string;
    description: string;
    diffPackageMap?: PackageHashToBlobInfoMap;
    isDisabled: boolean;
    isMandatory: boolean;
    /*generated*/ label?: string;
    manifestBlobUrl: string;
    originalDeployment?: string; // Set on "Promote"
    originalLabel?: string; // Set on "Promote" and "Rollback"
    packageHash: string;
    releasedBy?: string;
    releaseMethod?: string; // "Upload", "Promote" or "Rollback". Unknown if unspecified
    rollout?: number;
    size: number;
    uploadTime: number;
  }