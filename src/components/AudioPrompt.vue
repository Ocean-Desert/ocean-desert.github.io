<template>
  <button v-if="visible" id="audioPlayPrompt" class="audio-prompt" @click="handleClick" @mouseenter="hover = true"
    @mouseleave="hover = false" :style="buttonStyle">
    点亮圣诞树
  </button>
</template>

<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['play'])

const hover = ref(false)

const buttonStyle = computed(() => ({
  background: hover.value ? 'rgba(197, 168, 128, 0.2)' : 'rgba(22, 22, 22, 0.9)',
  borderColor: '#c5a880'
}))

const handleClick = () => {
  emit('play')
}
</script>

<style scoped>
.audio-prompt {
  position: fixed;
  top: 20px;
  right: 20px;
  background: rgba(22, 22, 22, 0.9);
  color: #c5a880;
  padding: 12px 24px;
  border-radius: 6px;
  border: 1px solid #c5a880;
  text-align: center;
  z-index: 10000;
  cursor: pointer;
  font-size: 14px;
  font-family: sans-serif;
  outline: none;
  transition: all 0.3s ease;
  user-select: none;
  -webkit-user-select: none;
  touch-action: manipulation;
}

/* 平板适配 */
@media screen and (max-width: 1024px) {
  .audio-prompt {
    top: 15px;
    right: 15px;
    padding: 10px 20px;
    font-size: 13px;
  }
}

/* 移动端适配 */
@media screen and (max-width: 768px) {
  .audio-prompt {
    top: 10px;
    right: 10px;
    padding: 10px 18px;
    font-size: 12px;
    border-radius: 4px;
  }
}

/* 小屏幕手机 */
@media screen and (max-width: 480px) {
  .audio-prompt {
    top: 8px;
    right: 8px;
    padding: 8px 16px;
    font-size: 11px;
    border-radius: 4px;
  }
}

/* 横屏模式 */
@media screen and (max-height: 500px) and (orientation: landscape) {
  .audio-prompt {
    top: 5px;
    right: 5px;
    padding: 6px 12px;
    font-size: 10px;
  }
}
</style>
