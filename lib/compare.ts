/**
 * 비교 화면의 공용 상수.
 *
 * "use client" 모듈에서 내보낸 값을 서버 컴포넌트가 가져오면 클라이언트 참조로
 * 바뀌어 undefined가 된다. 서버와 클라이언트가 함께 쓰는 값은 이렇게 평범한
 * 모듈에 둔다.
 */
export const MAX_COMPARE = 4;

/** 회사마다 한 가지씩. 순서대로 돌려 쓴다. */
export const COMPARE_COLORS = ["#3182f6", "#f04452", "#15803d", "#ff9200"];

export function compareColor(index: number): string {
  return COMPARE_COLORS[index % COMPARE_COLORS.length];
}
