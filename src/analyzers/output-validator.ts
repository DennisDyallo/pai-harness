/**
 * Output Validator — validates hook output against Claude Code's expected schema
 */

import type { ValidHookOutput } from '../core/types';

export interface ValidationError {
  field: string;
  message: string;
  value: unknown;
}

const VALID_DECISIONS = ['allow', 'deny', 'block', 'ask'] as const;
const VALID_PERMISSION_DECISIONS = ['allow', 'deny', 'ask'] as const;

export function validateHookOutput(output: unknown): ValidationError[] {
  const errors: ValidationError[] = [];

  if (output === null || output === undefined) {
    errors.push({ field: 'root', message: 'Output is null or undefined', value: output });
    return errors;
  }

  if (typeof output !== 'object') {
    errors.push({ field: 'root', message: 'Output must be an object', value: output });
    return errors;
  }

  const obj = output as Record<string, unknown>;

  if ('continue' in obj && typeof obj.continue !== 'boolean') {
    errors.push({ field: 'continue', message: 'Must be a boolean', value: obj.continue });
  }

  if ('suppressOutput' in obj && typeof obj.suppressOutput !== 'boolean') {
    errors.push({ field: 'suppressOutput', message: 'Must be a boolean', value: obj.suppressOutput });
  }

  if ('systemMessage' in obj && typeof obj.systemMessage !== 'string') {
    errors.push({ field: 'systemMessage', message: 'Must be a string', value: obj.systemMessage });
  }

  if ('decision' in obj) {
    if (typeof obj.decision !== 'string' || !(VALID_DECISIONS as readonly string[]).includes(obj.decision)) {
      errors.push({ field: 'decision', message: `Must be one of: ${VALID_DECISIONS.join(', ')}`, value: obj.decision });
    }
  }

  if ('reason' in obj && typeof obj.reason !== 'string') {
    errors.push({ field: 'reason', message: 'Must be a string', value: obj.reason });
  }

  if ('message' in obj && typeof obj.message !== 'string') {
    errors.push({ field: 'message', message: 'Must be a string', value: obj.message });
  }

  if ('hookSpecificOutput' in obj) {
    const hso = obj.hookSpecificOutput;
    if (typeof hso !== 'object' || hso === null) {
      errors.push({ field: 'hookSpecificOutput', message: 'Must be an object', value: hso });
    } else {
      const hsoObj = hso as Record<string, unknown>;
      if (!('hookEventName' in hsoObj) || typeof hsoObj.hookEventName !== 'string') {
        errors.push({ field: 'hookSpecificOutput.hookEventName', message: 'Required string field', value: hsoObj.hookEventName });
      }
      if ('permissionDecision' in hsoObj) {
        if (typeof hsoObj.permissionDecision !== 'string' || !(VALID_PERMISSION_DECISIONS as readonly string[]).includes(hsoObj.permissionDecision)) {
          errors.push({ field: 'hookSpecificOutput.permissionDecision', message: `Must be one of: ${VALID_PERMISSION_DECISIONS.join(', ')}`, value: hsoObj.permissionDecision });
        }
      }
      if ('permissionDecisionReason' in hsoObj && typeof hsoObj.permissionDecisionReason !== 'string') {
        errors.push({ field: 'hookSpecificOutput.permissionDecisionReason', message: 'Must be a string', value: hsoObj.permissionDecisionReason });
      }
      if ('updatedInput' in hsoObj && (typeof hsoObj.updatedInput !== 'object' || hsoObj.updatedInput === null)) {
        errors.push({ field: 'hookSpecificOutput.updatedInput', message: 'Must be an object', value: hsoObj.updatedInput });
      }
      if ('additionalContext' in hsoObj && typeof hsoObj.additionalContext !== 'string') {
        errors.push({ field: 'hookSpecificOutput.additionalContext', message: 'Must be a string', value: hsoObj.additionalContext });
      }
    }
  }

  return errors;
}

export function isValidHookOutput(output: unknown): output is ValidHookOutput {
  return validateHookOutput(output).length === 0;
}
