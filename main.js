
const url = require("url")

const util = require("util")

const express = require("express")
const bodyParser = require("body-parser")
const cookieSession = require("cookie-session")
const fs = require("fs")
const formidable = require("formidable")
const flash = require("connect-flash")
const bcrypt = require("bcrypt")

const config = require("./config")

const MongoClient = require("mongodb").MongoClient
const assert = require("assert")
const ObjectID = require("mongodb").ObjectID



MongoClient.connect(config.mongodbURL, function(err, db) {

  const app = express()

  app.listen(8099, function() {
    console.log("Running on port 8099")
  })

  app.use(cookieSession({
    name: "session",
    keys: [config.secretKey]
  }))

  app.use(bodyParser.json())

  app.use(bodyParser.urlencoded({extended: false}))

  app.use(function (req, res, next) {
    const readFile = util.promisify(fs.readFile)

    if (req.accepts("multipart/form-data")) {
      const form = new formidable.IncomingForm()

      form.parse(req, function (err, fields, files) {
        assert.equal(err)

        ;(async function () {
          const body = {}

          for (const [key, value] of Object.entries(fields)) {
            if (value === "") continue
            body[key] = value
          }

          for (const [key, file] of Object.entries(files)) {
            if (file.size === 0) continue
            body[key] = {
              data: await readFile(file.path),
              type: file.type,
              path: file.path,
              size: file.size,
              name: file.name
            }
          }

          req.body = body

          next()
        })()
      })
    } else {
      next()
    }
  })

  app.use(flash())


  app.set("view engine", "ejs")

  app.get("/", function (req, res) {
    res.render("index.ejs", {username: req.session.username})
  })

  app.get("/signin", function(req, res) {
    res.render("signin.ejs", {messages: req.flash("info")})
  })

  app.get("/signup", function(req, res) {
    res.render("signup.ejs", {messages: req.flash("info")})
  })

  app.get("/restaurant/new", function(req, res) {
    res.render("restaurant/new.ejs", {username: req.session.username})
  })

  app.get("/restaurant/list", function(req, res) {
    db.collection("restaurants")
      .find({}, {restaurantName: 1})
      .toArray(function (err, restaurants) {
        assert.equal(err, null)

        res.render("restaurant/list.ejs", {restaurants})
      })
  })

  app.get("/restaurant/show", function(req, res) {
    db.collection("restaurants")
      .findOne({"_id": ObjectID(req.query.id)}, function (err, restaurant) {
        assert.equal(err, null)

        res.render("restaurant/show.ejs", {restaurant})
      })
  })

  app.get("/restaurant/delete", function(req, res) {
    db.collection("restaurants")
      .find({}, {restaurantName: 1})
      .toArray(function(err, restaurants) {
        assert.equal(err, null)

        res.render("restaurant/delete.ejs", {restaurants})
      })
  })

  app.get("/restaurant/search", function(req, res) {
    if (Object.keys(req.query).length > 0) {
      db.collection("restaurants")
        .find({restaurantName: req.query.restName})
        .toArray(function(err, restaurants) {
          assert.equal(err, null)

          res.render("restaurant/list.ejs", {restaurants})
        })
    } else {
      res.render("restaurant/search.ejs")
    }
  })

  app.post("/signup", function(req, res) {
    const username = req.body.username
    const password = req.body.password
    const cpassword = req.body.cpassword

    if (password !== cpassword) {
      req.flash("info", "Your password does not match")
      res.redirect("/signup")
    } else {
      db.collection("users").find({username: username}).toArray(function(err, result) {
        assert.equal(err, null)

        if (result.length > 0) {
          req.flash("info", "This username is invalid because it had been used.")
          res.redirect("/signup")
        } else {
          const doc = {"username": username, "password": password}
          db.collection("users").insertOne(doc, function (err) {
            assert.equal(err, null)

            req.flash("info", "Register successfully, please login now")
            res.redirect("/signin")
          })
        }
      })
    }
  })

  app.post("/signin", function(req, res) {
    const {username, password} = req.body

    db.collection("users").find({username, password}).count(function (err, count) {
      assert.equal(err, null)

      if (count === 1) {
        req.session.username = username
        res.redirect("/")
      } else {
        req.flash("info", "Your username or password is wrong.")
        res.redirect("/signin")
      }
    })
  })

  app.post("/restaurant/new", function (req, res) {
    function assign(dest, src, keys) {
      for (const k of keys) {
        if (src[k]) dest[k] = src[k]
      }
    }

    const doc = {owner: req.session.username}
    const address = {}

    assign(doc, req.body, ["name", "borough", "cuisine"])
    assign(address, req.body, ["street", "building", "zipcode"])

    if (req.body.fileUpload) {
      doc.photo = req.body.fileUpload.data.toString("base64")
      doc.photoMimetype = req.body.fileUpload.type
    }

    if (req.body.lat && req.body.lng) {
      address.coord = [+req.body.lat, +req.body.lng]
    }

    if (Object.keys(address).length > 0) {
      doc.address = address
    }

    db.collection("restaurants").insertOne(doc, function(err) {
      assert.equal(err, null)

      req.flash("Inserted 1 restaurant")
      res.redirect("/")
    })
  })

  /*
  app.post("/restaurant/new", function(req, res) {
    console.log("test multipart parser: ", req.body)
    const form = new formidable.IncomingForm();
    form.parse(req, function (err, fields, files) {
      console.log(JSON.stringify(files))

      var filename = files.fileUpload.path

      if (files.fileUpload.type) {
        var mimetype = files.fileUpload.type
      }
      console.log("filename = " + filename)
      fs.readFile(filename, function(err,data) {
        const newRest = {
          "restaurantName": fields.restaurantName,
          "borough": fields.borough,
          "cuisine": fields.cuisine,
          "street": fields.street,
          "building": fields.building,
          "zipcode": fields.zipcode,
          "lat": fields.lat,
          "lng": fields.lng,
          "rate": "",
          "owner": fields.owner,
          "mimetype": mimetype,
          "image": new Buffer(data).toString("base64")
        }

        if (err) throw err
        db.collection("restaurants").insertOne(newRest, function(err) {
          if (err) throw err
          console.log("1 document inserted")
        })
      })


      res.redirect("/")

    })
  })
  */

  app.get("/restaurant/update", function(req, res) {
    const username = req.session.username

    if (req.query.id) {
      const restaurant_id = req.query.id

      db.collection("restaurants").find({_id: ObjectID(restaurant_id)}).toArray(function (err, result) {
        assert.equal(err, null)

        res.render("restaurant/update_info.ejs", {result: result})
      })

    } else {
      db.collection("restaurants").find({owner: username}).toArray(function (err, result) {
        assert.equal(err, null)

        res.render("restaurant/update_list.ejs", {username, result})
      })
    }
  })

  app.post("/restaurant/update", function(req, res) {
    const parsedURL = url.parse(req.url, true)
    const queryAsObject = parsedURL.query

    var form = new formidable.IncomingForm();
    form.parse(req, function (err, fields, files) {
      console.log(JSON.stringify(files))

      var filename = files.fileUpload.path

      if (files.fileUpload.type) {
        var mimetype = files.fileUpload.type
      }
      console.log("filename = " + filename)
      fs.readFile(filename, function(err,data) {
        if (err) throw err
        const criteria = {"_id": ObjectID(fields.restaurant_id)}
        if (files.fileUpload.size == 0) {
          const newValue = { $set: {
            "restaurantName": fields.newRestaurantName,
            "borough": fields.newBorough,
            "cuisine": fields.newCuisine,
            "street": fields.newStreet,
            "building": fields.newBuilding,
            "zipcode": fields.newZipcode,
            "lat": fields.newLat,
            "lng": fields.newLng,
            "owner": fields.newOwner
          }
          }
          db.collection("restaurants").updateOne(criteria, newValue, function(err) {
            if (err) throw err
            console.log("1 document updated")
          })
          res.redirect("/")
        } else {
          const newValue = { $set: {
            "restaurantName": fields.newRestaurantName,
            "borough": fields.newBorough,
            "cuisine": fields.newCuisine,
            "street": fields.newStreet,
            "building": fields.newBuilding,
            "zipcode": fields.newZipcode,
            "lat": fields.newLat,
            "lng": fields.newLng,
            "owner": fields.newOwner,
            "mimetype": mimetype,
            "image": new Buffer(data).toString("base64")
          }
          }
          db.collection("restaurants").updateOne(criteria, newValue, function(err) {
            if (err) throw err
            console.log("1 document updated")
          })
          res.redirect("/")
        }
      })
    })
  })

  app.post("/restaurant/delete", function(req, res) {
    db.collection("restaurants").deleteOne({"_id": ObjectID(req.params.id)}, function(err, obj) {
      if (err) throw err

      res.redirect("/")
    })
  })

})
