declare module '*?raw' {
  const content: string;
  export default content;
}

declare module '../../build/raw-text-plugin.mjs' {
  export function rawTextPlugin(): {
    name: string;
    enforce: string;
    load(id: string): { code: string; map: null } | null;
  };
}
