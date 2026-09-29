import { RepoFile } from "./walk";

export interface LoadedFile {
  file: RepoFile;
  raw: string;
  code: string; // comments/strings stripped, offsets preserved
  lines: number;
}
