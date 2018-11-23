
const url = require("url")

const express = require("express")
const bodyParser = require("body-parser")
const cookieParser = require("cookie-parser")
const session = require("cookie-session")
const fs = require("fs")
const formidable = require("formidable")
const bcrypt = require("bcrypt")
const saltRounds = 10
// const cookieSession = require("cookie-session")

const MongoClient = require("mongodb").MongoClient
const assert = require("assert")
const ObjectID = require("mongodb").ObjectID
const mongourl = "mongodb://developer:developer123@ds163226.mlab.com:63226/381-mini-project"


MongoClient.connect(mongourl, function(err, db) {

  const app = express()

  app.listen(8099, function() {
    console.log("Running on port 8099")
  })

  const SECRETKEY1 = "COMPS381F"
  const SECRETKEY2 = "NODEJS"

  const users = new Array(
    {username: ""}
  )

  app.use(session({
    username: "session",
    keys: [SECRETKEY1, SECRETKEY2]
  }))

  app.use(bodyParser.json())

  app.use(bodyParser.urlencoded({extended: false}))

  app.use(cookieParser())


  app.set("view engine", "ejs")

  app.get("/signin.html", function(req, res) {
    res.sendFile(__dirname + "/views/signin.html")
  })

  app.get("/signup.html", function(req, res) {
    res.sendFile(__dirname + "/views/signup.html")
  })

  //------------ Redirect to index.ejs after sign in -----------------//
  app.get("/index", function(req, res) {
    const username = req.cookies.cookieName
    res.render("index.ejs", {username: username})
  })

  //------------------------------------------------------------------//

  //------------ Handle routing of index.ejs -------------------------//
  app.get("/createNewRestaurant", function(req, res) {
    const username = req.body.username
    res.render("create_new_restaurant.ejs", {username})
  })

  app.get("/updateRestaurant", function(req, res) {
    res.redirect("/updateRestaurantDocument")
  })

  app.get("/displayRestaurant.ejs", function(req, res) {
    res.render("display_restaurant.ejs")
  })

  app.get("/displayRestaurant.ejs", function(req, res) {
    res.render("search_restaurant.ejs")
  })

  //-------------------------------------------------------------//

  function queryAsArray(db, collection, query, callback) {
    const result = []
    const cursor = db.collection(collection).find(query)

    cursor.each(function (err, doc) {
      assert.equal(err, null)
      if(doc !== null) {
        result.push(doc)
      } else {
        callback(result)
      }
    })
  }

  app.get("/", function (req, res) {
    res.sendFile(__dirname + "/views/signup.html")
  })

  app.post("/signup", function(req, res) {
    const username = req.body.username
    const password = req.body.password
    const cpassword = req.body.cpassword

    //------------------- FUNCTION: REGISTER ACCOUNT -------------------------//
    function register(username, res){
      findUserByUsername(db, username, function(result) {
        if (result.length > 0) {
          res.send("This username is invalid because it had been used.")
          res.end()
        }
        else {
          addUserToDatabase(username, password, res)
        }
      })
    }

    function findUserByUsername(db, username, callback) {
      queryAsArray(db, "users", {username:username}, callback)
    }

    //----------------- IF USERNAME IS VALID, INSERT USERNAME TO DATABASE -------------------//
    function addUserToDatabase(username, password, res){
      insertDocument(db, username, password, function() {
        res.send("Register successfully.")
      })
    }

    function insertDocument (db, username, password, callback) {
      db.collection("users").insertOne({
        "username": username,
        "password": password
      }, function (err, result) {
        assert.equal(err, null)
        callback(result)
      })
    }

    if (password !== cpassword) {
      res.send("Your password does not match")
    } else {
      register(username, res)
    }
  })

  app.post("/signin", function(req, res) {
    const username = req.body.username
    const password = req.body.password

    const myHash = "HashMyPassword"

    checkUsernamePassword(db, username, password, function(result) {
      if (result.length == 1) {
        req.session.authenticated = true
        req.session.username = users.username
        res.cookie("cookieName", req.body.username, { maxAge: 864000, httpOnly: true })
        res.redirect("index")

      } else {
        res.send("Your username or password is wrong.")
      }
    })

    function checkUsernamePassword(db, username, password, callback){
      queryAsArray(db, "users", {username:username, password:password}, callback)
    }

  })

  app.post("/createOneRestaurant", function(req, res) {
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


      res.redirect("index")

    })
  })

  app.get("/updateRestaurantDocument", function(req, res) {
    const username = req.cookies.cookieName
    searchRestaurantOwnedByUser(db, username, function(result){
      res.render("show_restaurant_can_be_updated.ejs", {username: username, numberOfDoc: result.length, result: result})
    })

    function searchRestaurantOwnedByUser(db, username, callback) {
      queryAsArray(db, "restaurants", {owner: username}, callback)
    }
  })

  app.get("/updateRestaurantInfo", function(req, res) {
    const parsedURL = url.parse(req.url, true)
    const queryAsObject = parsedURL.query

    const restaurant_id = queryAsObject.restaurants_id

    searchRestaurantById(db, restaurant_id, function(result) {
      const contentType = result[0].mimetype
      const image = new Buffer(result[0].image, "base64")
      console.log(image)
      res.render("update_restaurant_info.ejs", {result: result})

    })

    function searchRestaurantById(db, restaurant_id, callback) {
      queryAsArray(db, "restaurants", {_id: ObjectID(restaurant_id)}, callback)
    }


  })

  app.post("/updateRestaurantToDatabase", function(req, res) {
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
          res.redirect("index")
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
          res.redirect("index")
        }
      })

      //res.redirect("index")
    })
  })

})
