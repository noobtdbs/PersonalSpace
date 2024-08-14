# Backend production grade practice

## Notes

Database is always in another continent and while connecting your database try to wrap it in try-catch or async await 

There are two methods of connecting db -> one is to write its whole code in index.js and the other one is to write it in seperate file and export that in index
.js

we will use the module js so we will use "type" : "module" in the package.json file and while importing dotenv file 
we use: import dotenv 
dotenv.config({path:'./env})
and then in the package.json we will add -r dotenv/congig --experimental-josn-modules in the nodemon section of the Scripts section so that it downloads this.


