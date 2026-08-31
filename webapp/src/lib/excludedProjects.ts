export const EXCLUDED_PROJECT_NAMES = [
  "data-890e18da-164a-468a-b9f9-c14dd8ec0712-1786028947-d162bd83-batch-0000",
  "vps-setup",
  "test-oral",
  "tmp",
];

export function isExcludedProject(name: string): boolean {
  return EXCLUDED_PROJECT_NAMES.includes(name);
}