import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import session from "express-session";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const port = 3000;

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
});

pool.connect((err)=> {
  if(err) throw err
  console.log("connect to postgressSQL succesfully");
});

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use(session({ secret: 'secret', resave: false, saveUninitialized: true }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

async function checkVisited(userId) {
  const result = await db.query(
    "SELECT country_code FROM visited_countries WHERE user_id = $1;",
    [userId]
  );
  return result.rows.map(row => row.country_code);
}

async function getCurrentUser(userId) {
  const result = await db.query("SELECT * FROM users WHERE id = $1", [userId]);
  if (result.rows.length > 0) {
    return result.rows[0];
  }
  return null;
}

async function getFamilyMembers(familyId) {
  const result = await db.query("SELECT * FROM users WHERE family_id = $1", [familyId]);
  return result.rows;
}

app.get("/", (req, res) => {
  console.log("Rendering start.ejs");
  res.render("start.ejs");
});

app.post("/home", async (req, res) => {
  const username = req.body.username;
  console.log(`Received username: ${username}`);

  let result = await db.query("SELECT * FROM users WHERE name = $1", [username]);
  if (result.rows.length > 0) {
    const currentUser = result.rows[0];
    req.session.currentUserId = currentUser.id;
    req.session.currentFamilyId = currentUser.family_id;
  } else {
    const newFamilyId = await db.query("SELECT COALESCE(MAX(family_id), 0) AS max_family_id FROM users");
    const familyId = newFamilyId.rows[0].max_family_id + 1;

    result = await db.query(
      "INSERT INTO users (name, color, family_id) VALUES($1, $2, $3) RETURNING *;",
      [username, 'teal', familyId]
    );
    const newUser = result.rows[0];
    req.session.currentUserId = newUser.id;
    req.session.currentFamilyId = familyId;
  }

  const countries = await checkVisited(req.session.currentUserId);
  const currentUser = await getCurrentUser(req.session.currentUserId);
  const familyMembers = await getFamilyMembers(req.session.currentFamilyId);

  console.log("Rendering index.ejs with data:", {
    countries: countries,
    total: countries.length,
    users: familyMembers,
    color: currentUser.color,
  });

  res.render("index.ejs", {
    countries: countries,
    total: countries.length,
    users: familyMembers,
    color: currentUser.color,
  });
});

app.get("/home", async (req, res) => {
  if (!req.session.currentUserId) {
    res.redirect("/");
    return;
  }

  const countries = await checkVisited(req.session.currentUserId);
  const currentUser = await getCurrentUser(req.session.currentUserId);
  const familyMembers = await getFamilyMembers(req.session.currentFamilyId);

  console.log("Rendering index.ejs with data:", {
    countries: countries,
    total: countries.length,
    users: familyMembers,
    color: currentUser.color,
  });

  res.render("index.ejs", {
    countries: countries,
    total: countries.length,
    users: familyMembers,
    color: currentUser.color,
  });
});

app.post("/add", async (req, res) => {
  if (!req.session.currentUserId) {
    console.log("No user session found. Redirecting to start.");
    res.redirect("/");
    return;
  }

  const input = req.body.country;
  const currentUserId = req.session.currentUserId;

  console.log(`Adding visited country: ${input}`);

  try {
    const result = await db.query(
      "SELECT country_code FROM countries WHERE LOWER(country_name) LIKE '%' || $1 || '%';",
      [input.toLowerCase()]
    );

    const data = result.rows[0];
    if (data) {
      const countryCode = data.country_code;
      try {
        await db.query(
          "INSERT INTO visited_countries (country_code, user_id) VALUES ($1, $2)",
          [countryCode, currentUserId]
        );
        console.log("Country added successfully. Redirecting to home.");
        res.redirect("/home");
      } catch (err) {
        console.error("Error inserting visited country:", err);
        res.redirect("/home");
      }
    } else {
      console.error("Country not found");
      res.redirect("/home");
    }
  } catch (err) {
    console.error("Error querying country:", err);
    res.redirect("/home");
  }
});

app.post("/user", (req, res) => {
  console.log(`Handling /user route with data: ${req.body}`);
  if (req.body.add === "new") {
    res.render("new.ejs");
  } else {
    req.session.currentUserId = req.body.user;
    res.redirect("/home");
  }
});

app.post("/new", async (req, res) => {
  const name = req.body.name;
  const color = req.body.color;
  const familyId = req.session.currentFamilyId;

  console.log(`Adding new user: ${name}, color: ${color}, family_id: ${familyId}`);

  try {
    const result = await db.query(
      "INSERT INTO users (name, color, family_id) VALUES($1, $2, $3) RETURNING *;",
      [name, color, familyId]
    );

    const newUser = result.rows[0];
    req.session.currentUserId = newUser.id;

    res.redirect("/home");
  } catch (err) {
    console.error("Error inserting new user:", err);
    res.redirect("/home");
  }
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
