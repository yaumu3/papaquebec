/** Why `navigator.gpu` is missing, in words the operator can act on; null when it is there. */
export function webgpuMissingReason(hasGpu: boolean, secureContext: boolean): string | null {
  if (hasGpu) return null;
  return secureContext
    ? 'WebGPU is not available in this browser'
    : 'WebGPU needs a secure context: open the scope over https or via localhost';
}
