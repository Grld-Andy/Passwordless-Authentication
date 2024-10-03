require("dotenv").config()
const express = require("express")
const User = require("../model/User")
const authRouter = express.Router()
const auth = require("../middleware/auth")
const nodemailer = require("nodemailer")

// helper function to send emails
const transporter = nodemailer.createTransport({
    service: "gmail",
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: false,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
})

// route to get all users
authRouter.get("/", async (req, res) => {
    const users = await User.find({})
    res.status(200).send({users})
})

// route to get currently logged in users
authRouter.get("/me", auth, async (req, res) => {
    try {
        const user = req.user
        res.status(200).json({ user });
    } catch (err) {
        res.status(404).json({ error: "User not found" });
    }
})

// route to sign up
authRouter.post("/", async (req, res) => {
    try{
        const user = new User(req.body)
        await user.save()
        res.redirect(307, "/request-code")
    }catch(error){
        res.status(400).send(error)
    }
})

// route to request one time code
authRouter.post("/request-code", async (req, res) => {
    try{
        const email = req.body.email
        const user = await User.findOne({email}).exec()
        const otp = await user.generateOtp()

        const mailOptions = {
            from: process.env.SENDER_EMAIL,
            to: [user.email],
            replyTo: process.env.REPLY_TO,
            subject: "Passwordless Authentication",
            text: `This is your one time code\n${otp}\nCode expires in 5 minutes`
        };
        const info = await transporter.sendMail(mailOptions);

        res.status(200).send({
            status: "success",
            message: "A one-time code has been sent to your email address."
        })
    }catch(error){
        res.status(400).send({
            status: "error",
            message: "The email address is not a valid email address",
        })
    }
})

// route to verify one time code to login user for an hour
authRouter.post("/verify-code", async (req, res) => {
    try{
        const { email, code } = req.body
        const user = await User.findOne({email}).exec()
        // const user = await User.findOne({'otp.code': code}).exec()
        if(!user){
            res.status(404).send({
                "status": "error",
                "message": "The email address is not a valid email address"
            })
        }
        if(user.otp.code != code){
            res.status(400).send({
                status: "Error",
                message: "The one-time code you entered is invalid."
            })
        }
        if(user.otp.expires_at < new Date()){
            res.status(400).send({
                message: "The one-time code has expired. Please request a new code.",
                status: "error",
            })
        }
        if(user.otp.used){
            res.status(400).send({
                message: "The one-time code has expired. Please request a new code.",
                status: "error",
            })
        }
        const token = await user.generateAuthToken()
        res.send({
            status: "success",
            message: "Authentication successful. You are now logged in.",
            token,
            expires_in: 3600
        })
    }catch(err){
        console.log("An error occured")
        res.status(400).send(err)
    }
})

// Manual logout
authRouter.post('/logout', async (req, res) => {
    res.json({
        status: 'success',
        message: 'You have been logged out successfully.',
    });
});

module.exports = authRouter