# aka-query-lib
A Typescript library for query strings.

`npm install aka-query-lib`

## Short Description
This library simplifies working with query strings, dynamically typechecks them and
enforces that they match a query interface.

See an example at example/example.ts

## Overview
The user must instantiate a QuerySpec class from the following:
- A query interface, which lists all desired parameters to a query
- A type environment, which defines at least all types in the interface
By default a type environment for basic plain-old-data types is provided for the user.
Using the QuerySpec, the user can parse query strings and turn querys back into strings.

## Query Interfaces
A query interface is a list of 3/4 tuples of the form:
1. The name of the parameter (must be unique)
2. The type of the parameter (must exist in the associated type environment)
3. The default value of the parameter
4. A function which constrains the possible values of the parameter (OPTIONAL)

## Query Type Environments
A query type environment is a Map from type names (strings) to a tuple defining the type T with two functions:
1. string -> T: where we convert a string to T and typecheck, this can fail so the return type is an Option type.
2. T -> string: we convert the type T into a string so it can be embedded into a query string.

## Technical Properties of a QuerySpec
A query spec ensures the following properties:
1. A query made from any query string is guaranteed to adhere to the spec
2. Likewise a query string made from any query is guaranteed to adhere to the spec

Adherence to the spec is defined as:
1. Returning zero or more parameters listed in the interface
2. Excluding all non-conforming parameters

Parameters can be non-conforming if:
1. They are missing from the query
2. They fail their type check
3. They fail their constraint check

In summary, the QuerySpec sanitizes all queries and forces adherence an interface and type environment