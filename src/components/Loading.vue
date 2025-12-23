<template>
  <div v-if="visible" class="loading">
    {{ message }}
  </div>
</template>

<script setup>
defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  message: {
    type: String,
    default: '正在加载资源，请稍等...'
  }
})
</script>

<style scoped>
.loading {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 1000;
  font-size: 2rem;
  color: #c5a880;
  font-family: sans-serif;
  text-align: center;
  padding: 20px;
  white-space: nowrap;
}

/* 平板适配 */
@media screen and (max-width: 1024px) {
  .loading {
    font-size: 1.5rem;
  }
}

/* 移动端适配 */
@media screen and (max-width: 768px) {
  .loading {
    font-size: 1.2rem;
    padding: 15px;
  }
}

/* 小屏幕手机 */
@media screen and (max-width: 480px) {
  .loading {
    font-size: 1rem;
    padding: 10px;
    white-space: normal;
    max-width: 90%;
  }
}
</style>
