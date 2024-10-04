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

/**
 * @swagger
 * /api/v1/auth:
 *   get:
 *     summary: Get all users
 *     responses:
 *       200:
 *         description: A successful response
 *       500:
 *          description: Failed to retrive users
 */
authRouter.get("/", async (req, res) => {
    try{
        const users = await User.find({})
        res.status(200).send({users})
    }
    catch(err){
        res.status(500).send({ error: "Failed to retrieve users." })
    }
})

/**
 * @swagger
 * /api/v1/auth/me:
 *   get:
 *     summary: Get current user details
 *     responses:
 *       200:
 *         description: A successful response
 *       404:
 *          description: User not found
 */
authRouter.get("/me", auth, async (req, res) => {
    try {
        const user = req.user
        res.status(200).json({ user })
    } catch (err) {
        res.status(404).json({ error: "User not found" })
    }
})

/**
 * @swagger
 * /api/v1/auth/request-code:
 *   post:
 *     summary: Request a one-time code for login
 *     responses:
 *       200:
 *         description: A successful response
 *       400:
 *          description: Invalid email address
 */
authRouter.post("/request-code", async (req, res) => {
    try{
        const email = req.body.email

        const user = await User.findOne({email}).exec()
        if (!user) {
            user = new User({ email })
            await user.save()
        }

        const otp = await user.generateOtp()

        const mailOptions = {
            from: process.env.SENDER_EMAIL,
            to: [user.email],
            replyTo: process.env.REPLY_TO,
            subject: "Passwordless Authentication",
            // text: `This is your one-time code:\n${otp}\nCode expires in 5 minutes.`, // Plain text version (optional)
            html: `
                <div>
                    <h1>Passwordless Authentication</h1>
                    <p>This is your one-time code:</p>
                    <h2 style="color: #f56607">${otp}</h2>
                    <p>The code expires in 5 minutes.</p>
                    <br />
                    <p>Thank you</p>
                </div>
            `
        }
        const info = await transporter.sendMail(mailOptions)

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

/**
 * @swagger
 * /api/v1/auth/verify-code:
 *   post:
 *     summary: Verify one-time code for login
 *     responses:
 *       200:
 *         description: A successful response
 *       400:
 *          description: The one-time code is invalid or expired
 *       404:
 *          description: No user with that one-time code
 */
authRouter.post("/verify-code", async (req, res) => {
    try{
        const { code } = req.body
        const user = await User.findOne({
            "otp.code": code,
            "otp.used": false
        }).exec()
        // const user = await User.findOne({'otp.code': code}).exec()
        if(!user){
            res.status(404).send({ // ask Ernest
                "status": "error",
                "message": "The one-time code you entered is invalid or expired"
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
        res.status(200).send({
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

/**
 * @swagger
 * /api/v1/auth/recruiter:
 *   post:
 *     summary: Create a recruiter
 *     responses:
 *       201:
 *         description: Recruiter created successfully
 *       409:
 *          description: User already exists
 *       500:
 *          description: Error occured while creating recruiter
 */
authRouter.post("/recruiter", async (req, res) => {
    try {
        const { name, email } = req.body
        const existingUser = await User.findOne({ email })
        if(existingUser){
            return res.status(409).send({
                status: "error",
                message: "A user with this email already exists."
            })
        }
        const recruiter = new User({
            name,
            email,
            isRecruiter: true
        })
        await recruiter.save()
        const token = await recruiter.generateAuthToken()
        res.status(201).send({
            status: "success",
            message: "Recruiter created successfully.",
            recruiter,
            token
        })
    } catch (error) {
        res.status(500).send({
            status: "error",
            message: "An error occurred while creating the recruiter.",
            error: error.message
        })
    }
})

/**
 * @swagger
 * /api/v1/auth/logout:
 *   post:
 *     summary: Logout user
 *     responses:
 *       200:
 *         description: Successfully logged out
 *       401:
 *         description: Unauthorized, user must log in first
 *       500:
 *          description: Failed to log out user
 */
authRouter.post('/logout', auth, async (req, res) => {
    try{
        res.status(200).send({
            status: 'success',
            message: 'You have been logged out successfully.',
        })
    }catch(error){
        res.status(500).send({
            status: "error",
            message: "An error occurred while logging out.",
            error: error.message
        })
    }
})

module.exports = authRouter