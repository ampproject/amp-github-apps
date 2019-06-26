declare module "unzip-stream" {
  import stream = require('stream');

  export function Extract(options: { path: string }): NodeJS.WritableStream;

  export function Parse(): NodeJS.WritableStream;  

  export interface Entry extends stream.PassThrough {
      path: string;
      type: 'Directory' | 'File';
      size: number;
      autodrain: () => void;
  }
}