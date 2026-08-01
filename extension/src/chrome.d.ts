declare namespace chrome {
  namespace runtime {
    const lastError: { message?: string } | undefined;
    function sendMessage(message: unknown): Promise<any>;
    function sendMessage(
      message: unknown,
      callback: (response: any) => void,
    ): void;
    const onMessage: {
      addListener(
        listener: (
          message: any,
          sender: any,
          sendResponse: (response: any) => void,
        ) => boolean | void,
      ): void;
    };
  }
  namespace storage {
    namespace local {
      function get(defaults: Record<string, unknown>): Promise<Record<string, any>>;
      function set(values: Record<string, unknown>): Promise<void>;
    }
    const onChanged: {
      addListener(
        listener: (
          changes: Record<string, { oldValue?: any; newValue?: any }>,
          areaName: string,
        ) => void,
      ): void;
    };
  }
}
