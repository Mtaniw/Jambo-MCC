import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Health check for infrastructure
  app.get("/api/health", (req, res) => res.json({ status: "ok" }));

  // API Routes
  app.post("/api/notify-status-change", async (req, res) => {
    const { email, userName, oldStatus, newStatus } = req.body;

    if (!email || !userName || !newStatus) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    try {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || "587"),
        secure: process.env.SMTP_PORT === "465",
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });

      const systemName = "Jambo Food Products MCC System";
      
      const mailOptions = {
        from: process.env.FROM_EMAIL || process.env.SMTP_USER,
        to: email,
        subject: `Account Status Update - ${systemName}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
            <h2 style="color: #d32f2f;">Account Status Changed</h2>
            <p>Habari <strong>${userName}</strong>,</p>
            <p>Taarifa ya akaunti yako kwenye mfumo wa <strong>${systemName}</strong> imebadilishwa.</p>
            <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <p style="margin: 5px 0;">Status ya awali: <span style="text-transform: capitalize; color: #757575;">${oldStatus || 'Unknown'}</span></p>
              <p style="margin: 5px 0;">Status mpya: <span style="text-transform: capitalize; color: #d32f2f; font-weight: bold;">${newStatus}</span></p>
            </div>
            ${newStatus === 'active' ? 
              `<p>Sasa unaweza kuingia kwenye mfumo na kuendelea na kazi zako. <br><a href="${process.env.APP_URL}" style="display: inline-block; background-color: #d32f2f; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin-top: 10px;">Bonyeza hapa kuingia (Sign In)</a></p>` : 
              `<p>Kama una maswali yoyote, tafadhali wasiliana na msimamizi wako.</p>`
            }
            <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
            <p style="font-size: 12px; color: #999;">Hii ni barua pepe inayozalishwa otomatiki, tafadhali usijibu barua pepe hii.</p>
          </div>
        `,
      };

      await transporter.sendMail(mailOptions);
      res.json({ success: true, message: "Email sent" });
    } catch (error: any) {
      console.error("Error sending email:", error);
      res.status(500).json({ error: "Failed to send email", detail: error.message });
    }
  });

  const isProd = process.env.NODE_ENV === "production";
  const distPath = path.resolve(process.cwd(), "dist");

  if (isProd && fs.existsSync(distPath)) {
    console.log("Serving static files from dist...");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  } else {
    console.log("Initializing Vite dev middleware...");
    const vite = await createViteServer({
      server: { 
        middlewareMode: true,
        hmr: false,
        watch: null, // Disable file watching to prevent HMR-related overhead
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

startServer().catch(err => {
  console.error("FAILED TO START SERVER:", err);
  process.exit(1);
});
