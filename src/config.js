import path from 'path'

require('dotenv').load({ silent: true })

const env = process.env

export const NODE_ENV = env.NODE_ENV || 'development'
export const PORT = env.PORT || 80
export const APP_URL = env.APP_URL || `http://localhost:${PORT}`

// Paths
export const ROOT_PATH = path.join(__dirname, '..')
export const SOURCE_PATH = path.join(ROOT_PATH, 'src')
