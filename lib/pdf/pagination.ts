export function clampPage(page: number, totalPages: number): number {
  if (totalPages < 1) return 1;
  return Math.min(Math.max(page, 1), totalPages);
}

export function canGoNext(currentPage: number, totalPages: number): boolean {
  return currentPage < totalPages;
}

export function canGoPrevious(currentPage: number, _totalPages?: number): boolean {
  return currentPage > 1;
}

export function nextPage(currentPage: number, totalPages: number): number {
  return canGoNext(currentPage, totalPages) ? currentPage + 1 : currentPage;
}

export function previousPage(currentPage: number, _totalPages?: number): number {
  return canGoPrevious(currentPage) ? currentPage - 1 : currentPage;
}
