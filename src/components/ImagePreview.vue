<template>
  <Transition name="zoom" @enter="onEnter" @leave="onLeave">
    <div v-if="visible" ref="previewRef" class="image-preview" @click.self="handleClose" @keydown.esc="handleClose">
      <div ref="containerRef" class="image-preview-container">
        <img ref="imageRef" :src="imageSrc" :alt="imageAlt" class="preview-image" @click="handleClose" />
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick } from 'vue'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  imageSrc: {
    type: String,
    default: ''
  },
  imageAlt: {
    type: String,
    default: '图片预览'
  },
  startPosition: {
    type: Object,
    default: () => ({ x: 0, y: 0, width: 0, height: 0 })
  }
})

const emit = defineEmits(['close'])

const previewRef = ref(null)
const containerRef = ref(null)
const imageRef = ref(null)

function handleClose () {
  emit('close')
}

// 监听 ESC 键关闭
function handleKeydown (event) {
  if (event.key === 'Escape' && props.visible) {
    handleClose()
  }
}

// 缓动函数（ease-out-cubic，更流畅的动画）
function easeOutCubic (t) {
  return 1 - Math.pow(1 - t, 3)
}

// 进入动画：从点击位置放大到全屏
function onEnter (el, done) {
  if (!containerRef.value || !imageRef.value) {
    done()
    return
  }

  const startPos = props.startPosition
  const container = containerRef.value
  const image = imageRef.value

  // 获取目标位置和尺寸（屏幕中心）
  const windowWidth = window.innerWidth
  const windowHeight = window.innerHeight

  // 计算图片的最终尺寸（保持宽高比，最大90%屏幕）
  const maxWidth = windowWidth * 0.9
  const maxHeight = windowHeight * 0.9

  // 获取图片尺寸（支持已加载的图片）
  const img = new Image()

  const startAnimation = () => {
    const aspectRatio = img.width / img.height
    let finalWidth = maxWidth
    let finalHeight = maxWidth / aspectRatio

    if (finalHeight > maxHeight) {
      finalHeight = maxHeight
      finalWidth = maxHeight * aspectRatio
    }

    const finalX = windowWidth / 2
    const finalY = windowHeight / 2

    // 设置初始位置和尺寸
    container.style.position = 'fixed'
    container.style.left = `${startPos.x}px`
    container.style.top = `${startPos.y}px`
    container.style.width = `${startPos.width}px`
    container.style.height = `${startPos.height}px`
    container.style.transform = 'translate(-50%, -50%)'
    container.style.transition = 'none'
    container.style.opacity = '1'

    // 强制重排
    container.offsetHeight

    // 开始动画（使用更流畅的弹性缓动）
    requestAnimationFrame(() => {
      container.style.transition = 'all 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)' // 弹性缓动，更流畅
      container.style.left = `${finalX}px`
      container.style.top = `${finalY}px`
      container.style.width = `${finalWidth}px`
      container.style.height = `${finalHeight}px`

      // 动画完成后保持最终状态，不要重置为auto
      setTimeout(() => {
        // 保持动画后的位置和尺寸，只清除过渡
        container.style.transition = '' // 清除过渡，避免影响后续操作
        done()
      }, 600)
    })
  }

  // 如果图片已加载，直接开始动画
  if (img.complete && img.naturalWidth > 0) {
    startAnimation()
  } else {
    img.onload = startAnimation
    img.onerror = () => {
      // 如果加载失败，使用默认尺寸
      startAnimation()
    }
  }

  img.src = props.imageSrc
}

// 离开动画：缩小回点击位置
function onLeave (el, done) {
  if (!containerRef.value) {
    done()
    return
  }

  const startPos = props.startPosition
  const container = containerRef.value

  // 获取当前尺寸
  const rect = container.getBoundingClientRect()
  const currentX = rect.left + rect.width / 2
  const currentY = rect.top + rect.height / 2
  const currentWidth = rect.width
  const currentHeight = rect.height

  // 设置动画起始状态
  container.style.position = 'fixed'
  container.style.left = `${currentX}px`
  container.style.top = `${currentY}px`
  container.style.width = `${currentWidth}px`
  container.style.height = `${currentHeight}px`
  container.style.transform = 'translate(-50%, -50%)'
  container.style.transition = 'none'

  // 强制重排
  container.offsetHeight

  // 开始缩小动画（快速且流畅）
  requestAnimationFrame(() => {
    container.style.transition = 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)' // 快速缩小
    container.style.left = `${startPos.x}px`
    container.style.top = `${startPos.y}px`
    container.style.width = `${startPos.width}px`
    container.style.height = `${startPos.height}px`
    container.style.opacity = '0'

    setTimeout(() => {
      // 清理所有样式，为下次打开做准备
      container.style.position = ''
      container.style.left = ''
      container.style.top = ''
      container.style.width = ''
      container.style.height = ''
      container.style.transform = ''
      container.style.transition = ''
      container.style.opacity = ''
      done()
    }, 350)
  })
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<style scoped>
.image-preview {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0);
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  overflow: hidden;
  backdrop-filter: blur(0px);
  transition: background-color 0.4s ease, backdrop-filter 0.4s ease;
}

.image-preview.zoom-enter-active {
  background: rgba(0, 0, 0, 0.9);
  backdrop-filter: blur(10px);
}

.image-preview-container {
  position: fixed;
  max-width: 90%;
  max-height: 90%;
  display: flex;
  align-items: center;
  justify-content: center;
  will-change: transform, width, height, left, top;
  /* 优化动画性能 */
  /* 默认居中，动画时会覆盖这些值 */
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
}

.preview-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
  user-select: none;
  pointer-events: none;
  border-radius: 12px;
  /* 圆角，更美观 */
  box-shadow: 0 25px 80px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.1);
  /* 多层阴影，增加层次感和边框效果 */
  transition: box-shadow 0.3s ease;
  /* 阴影过渡效果 */
}

.close-btn {
  position: absolute;
  top: -40px;
  right: 0;
  width: 40px;
  height: 40px;
  background: rgba(255, 255, 255, 0.2);
  border: 2px solid rgba(255, 255, 255, 0.5);
  border-radius: 50%;
  color: #fff;
  font-size: 24px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;
  backdrop-filter: blur(10px);
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.3);
  border-color: rgba(255, 255, 255, 0.8);
  transform: scale(1.1);
}

/* 背景淡入淡出动画 */
.zoom-enter-active {
  transition: background-color 0.3s ease;
}

.zoom-leave-active {
  transition: background-color 0.2s ease;
}

.zoom-enter-from,
.zoom-leave-to {
  background-color: rgba(0, 0, 0, 0);
}

/* 移动端适配 */
@media (max-width: 768px) {
  .image-preview-container {
    max-width: 95%;
    max-height: 95%;
  }

  .close-btn {
    top: -35px;
    right: -10px;
    width: 35px;
    height: 35px;
    font-size: 20px;
  }
}
</style>
