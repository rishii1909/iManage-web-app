const express = require('express');
const router = express.Router();


router.get('/secure_route', (req, res, next) => {
    res.json({
        message : "Secure route accessed.",
        user : req.user,
        token : req.query.auth_token
    })
})



module.exports = router;