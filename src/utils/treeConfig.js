// 圣诞树尺寸配置（供图片随机定位使用）
export const treeBaseY = -8;             // 树底部y坐标
export const treeHeight = 35;            // 树总高度
export const treeBottomRadius = 18;      // 树底半径
export const treeTopRadius = 0;          // 树顶半径
export const treeCenterX = 0;
export const treeCenterZ = -30;

/**
 * 计算指定高度处的树半径（线性收尖）
 * @param {number} y - y坐标
 * @returns {number} 半径
 */
export function getTreeRadiusAtHeightGlobal(y) {
    const normalizedY = (y - treeBaseY) / treeHeight;
    return treeBottomRadius * (1 - normalizedY) + treeTopRadius * normalizedY;
}

