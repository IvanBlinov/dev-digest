import { runTool, toolError } from './tool-result';
import { GetBlastRadiusInput } from './schemas';

export const definition = {
  name: 'get_blast_radius',
  config: {
    title: 'Get PR blast radius (not implemented)',
    description:
      'Not implemented yet — always returns an error. Planned: list the symbols a PR changes and the code that depends on them.',
    inputSchema: GetBlastRadiusInput.shape,
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  },
};

export const NOT_IMPLEMENTED_TEXT =
  "get_blast_radius is not implemented yet. Use get_findings for this PR's review findings.";

// No service on purpose (no I/O, no decision, no data); a real implementation adds one.
export const handler = () => () => runTool(async () => toolError(NOT_IMPLEMENTED_TEXT));
