// templatePaths
// Resolves important Dreamweaver template directories and paths.

import * as path from 'path';

export const TEMPLATE_FOLDER_REGEX = /(?:^|[\\/])templates(?:[\\/]|$)/i;

const TEMPLATE_EXTENSIONS = new Set(['.dwt', '.html', '.htm', '.php']);

export const isTemplateFolderPath = (filePath: string): boolean =>
  TEMPLATE_FOLDER_REGEX.test(filePath.toLowerCase());

export const isTemplateFilePath = (filePath: string): boolean => {
  const lower = filePath.toLowerCase();
  const ext = path.extname(lower);
  return TEMPLATE_EXTENSIONS.has(ext) && isTemplateFolderPath(lower);
};

export const getNormalizedPath = (filePath: string): string => path.resolve(filePath);