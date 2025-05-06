const express = require("express");
const cors = require("cors");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const dotenv = require("dotenv");

const fs = require("fs");
if (!fs.existsSync("./media")) {
  fs.mkdirSync("./media");
}

dotenv.config();

const app = express();

const db = new sqlite3.Database("screens.db", (err) => {
  if (err) {
    console.error("خطأ في الاتصال بقاعدة البيانات:", err.message);
  } else {
    console.log("تم الاتصال بقاعدة البيانات بنجاح");
  }
});

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS screens (
        id TEXT PRIMARY KEY,
        orientation TEXT DEFAULT 'horizontal',
        ip TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

  db.run(`CREATE TABLE IF NOT EXISTS media (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        screen_id TEXT,
        url TEXT,
        duration INTEGER DEFAULT 15,
        FOREIGN KEY(screen_id) REFERENCES screens(id)
    )`);
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/media", express.static(path.join(__dirname, "media")));

app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");

app.get("/", (req, res) => {
  res.send("الخادم يعمل بشكل صحيح");
});

app.get("/admin", (req, res) => {
  try {
    db.all("SELECT * FROM screens", [], (err, screens) => {
      if (err) {
        console.error("خطأ في قاعدة البيانات:", err);
        res.status(500).json({ error: err.message });
        return;
      }
      console.log("تم استرجاع الشاشات:", screens);
      res.render("admin", { screens: screens || [] });
    });
  } catch (error) {
    console.error("خطأ في معالجة الطلب:", error);
    res.status(500).send("حدث خطأ في الخادم");
  }
});

app.get("/admin/screen/:id", (req, res) => {
  const screenId = req.params.id;
  db.get("SELECT * FROM screens WHERE id = ?", [screenId], (err, screen) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    db.all(
      "SELECT * FROM media WHERE screen_id = ?",
      [screenId],
      (err, mediaItems) => {
        if (err) {
          res.status(500).json({ error: err.message });
          return;
        }
        res.render("screen", { screen, mediaItems });
      }
    );
  });
});

app.post("/admin/screen", (req, res) => {
  const { id, orientation } = req.body;
  db.run(
    "INSERT INTO screens (id, orientation) VALUES (?, ?)",
    [id, orientation],
    (err) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.redirect("/admin");
    }
  );
});

app.post("/admin/media", (req, res) => {
  const { screen_id, url, duration } = req.body;
  db.run(
    "INSERT INTO media (screen_id, url, duration) VALUES (?, ?, ?)",
    [screen_id, url, duration],
    (err) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.redirect(`/admin/screen/${screen_id}`);
    }
  );
});

app.get("/screens/:screen_id/media", (req, res) => {
  const screenId = req.params.screen_id;
  db.all(
    "SELECT url, duration FROM media WHERE screen_id = ?",
    [screenId],
    (err, media) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      const mediaResponse = {
        urls: media.map((m) => m.url),
        duration: media[0]?.duration || 15,
      };
      res.json(mediaResponse);
    }
  );
});

app.get("/api/screens/:screen_id/orientation", (req, res) => {
  const screenId = req.params.screen_id;
  db.get(
    "SELECT orientation FROM screens WHERE id = ?",
    [screenId],
    (err, row) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({ orientation: row?.orientation || "horizontal" });
    }
  );
});

app.post("/api/screens/:screen_id/ip", (req, res) => {
  const screenId = req.params.screen_id;
  const { ip } = req.body;

  if (!ip) {
    return res.status(400).json({ error: "IP address is required" });
  }

  db.run("UPDATE screens SET ip = ? WHERE id = ?", [ip, screenId], (err) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.sendStatus(200);
  });
});

app.post("/api/screens/:screen_id/orientation", (req, res) => {
  const screenId = req.params.screen_id;
  const { orientation } = req.body;

  if (!orientation || !["horizontal", "vertical"].includes(orientation)) {
    return res
      .status(400)
      .json({ error: "يجب تحديد الاتجاه بشكل صحيح (horizontal أو vertical)" });
  }

  db.run(
    "UPDATE screens SET orientation = ? WHERE id = ?",
    [orientation, screenId],
    (err) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.sendStatus(200);
    }
  );
});

app.get("/api/current-firmware-version", (req, res) => {
  res.json("1.0.0");
});

app.use((err, req, res, next) => {
  console.error("خطأ:", err.stack);
  res.status(500).json({ error: "حدث خطأ في الخادم" });
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`تم تشغيل الخادم بنجاح على المنفذ ${PORT}`);
  console.log(
    `يمكنك الوصول إلى لوحة التحكم على: http://${getLocalIP()}:${PORT}/admin`
  );
  console.log(
    `يمكنك الوصول إلى الصفحة الرئيسية على: http://${getLocalIP()}:${PORT}/`
  );
});

function getLocalIP() {
  const os = require("os");

  const interfaces = os.networkInterfaces();

  for (const interfaceName in interfaces) {
    for (const iface of interfaces[interfaceName]) {
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }

  return "localhost";
}
