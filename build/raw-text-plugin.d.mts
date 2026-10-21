export declare function rawTextPlugin(): {
  name: string;
  enforce: string;
  load(id: string): { code: string; map: null } | null;
};