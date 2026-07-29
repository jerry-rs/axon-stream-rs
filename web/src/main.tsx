import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './app.tsx'
import { initAuth } from '@/lib/api-client'

// 页面刷新后恢复 token 定时刷新
initAuth()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
