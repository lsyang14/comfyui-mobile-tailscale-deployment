import { fileURLToPath } from 'node:url';

export function defaultWorkflowPath(moduleUrl) {
  return fileURLToPath(new URL('../workflow-krea2.json', moduleUrl));
}
