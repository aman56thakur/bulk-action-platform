const express = require('express')
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const bulkActionController = require('../controllers/bulkActionController')

const router = express.Router()

const uploadDir = path.join(__dirname, '../../uploads')
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true })
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir)
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`)
  },
})

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true)
    } else {
      cb(new Error('Only .csv files are allowed!'), false)
    }
  },
})

router.post('/', upload.single('file'), bulkActionController.createBulkAction)
router.get('/', bulkActionController.listBulkActions)
router.get('/:actionId', bulkActionController.getBulkAction)
router.get('/:actionId/stats', bulkActionController.getBulkActionStats)
router.get('/:actionId/logs', bulkActionController.getBulkActionLogs)

module.exports = router
