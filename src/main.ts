import { execute, parse } from 'graphql'
import { schema } from './schema/schema'
 
async function main() {
  const myQuery = parse(/* GraphQL */ `
    query {
      hello
    }
  `)
 
  const result = await execute({
    schema,
    document: myQuery
  })
 
  console.log(result)
}
 
main()