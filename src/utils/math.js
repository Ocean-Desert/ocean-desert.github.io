// 从Math对象解构常用数学函数
const { PI, sin, cos } = Math;
// 完整圆周角（2π）
export const TAU = 2 * PI;

/**
 * 数值映射函数：将值从一个范围映射到另一个范围
 * @param {number} value - 输入值
 * @param {number} sMin - 源范围最小值
 * @param {number} sMax - 源范围最大值
 * @param {number} dMin - 目标范围最小值
 * @param {number} dMax - 目标范围最大值
 * @returns {number} 映射后的值
 */
export const map = (value, sMin, sMax, dMin, dMax) => {
    return dMin + (value - sMin) / (sMax - sMin) * (dMax - dMin);
};

/**
 * 生成随机浮点数
 * @param {number} max - 最大值
 * @param {number} min - 最小值，默认为0
 * @returns {number} 随机浮点数
 */
export const rand = (max, min = 0) => min + Math.random() * (max - min);

/**
 * 生成随机整数
 * @param {number} max - 最大值
 * @param {number} min - 最小值，默认为0
 * @returns {number} 随机整数
 */
export const randInt = (max, min = 0) => Math.floor(min + Math.random() * (max - min));

/**
 * 从数组中随机选择一个元素
 * @param {Array} arr - 数组
 * @returns {*} 随机选择的元素
 */
export const randChoise = arr => arr[randInt(arr.length)];

/**
 * 极坐标转直角坐标
 * @param {number} ang - 角度（弧度）
 * @param {number} r - 半径，默认为1
 * @returns {Array} [x, y] 坐标数组
 */
export const polar = (ang, r = 1) => [r * cos(ang), r * sin(ang)];

