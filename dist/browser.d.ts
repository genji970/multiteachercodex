export type BrowserLaunchResult = {
    launched: boolean;
    executable?: string;
    profileDir?: string;
    reason?: string;
};
export declare function launchChatGptBrowser(extensionDir: string): BrowserLaunchResult;
