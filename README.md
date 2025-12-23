# Christmas Tree Vue 3

这是一个使用 Vue 3 和 Three.js 创建的圣诞树 3D 体验项目。

## 项目结构

```
christmas/
├── src/
│   ├── components/
│   │   ├── ChristmasTree.vue    # 主组件（包含所有 Three.js 逻辑）
│   │   ├── AudioPrompt.vue       # 音频播放提示组件
│   │   └── Loading.vue           # 加载提示组件
│   ├── utils/
│   │   ├── math.js               # 数学工具函数
│   │   └── treeConfig.js         # 圣诞树配置
│   ├── App.vue                   # 根组件
│   ├── main.js                   # 入口文件
│   └── style.css                 # 全局样式
├── assets/                       # 资源文件
│   ├── audio/                    # 音频文件
│   └── images/                   # 图片文件
├── index.html                    # HTML 入口
├── package.json                  # 项目配置
└── vite.config.js               # Vite 配置
```

## 安装依赖

```bash
npm install
```

## 开发

```bash
npm run dev
```

## 构建

```bash
npm run build
```

## 技术栈

- Vue 3 (Composition API)
- Three.js 0.160.0
- Vite

