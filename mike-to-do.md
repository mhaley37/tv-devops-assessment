

## Step 1

- Create a production-optiomized DockerFile
  - What does the dockeFile need to do?

1. First have to build the app

   - Install ALL dependencies (npm install)
   - Then tarnspile typescript into js, 



- Create a `docker-compose.yml` to orchestrate the app
- Add a `.dockerignore` to reduce build context size
- App must respond to `http://localhost:30000/health`

#### Checklist of things to do/look at irt
Checklist as I have to work on this in bursts around other schedule:


- Update .gitignore
- Check if github adction workflows can be access from non-root paths of the repo as the instructions tell you to do.


#### Potential issues found:

1. Doing a "npm install" cites multiple warnings, but no vulnerabilities:

```
npm warn deprecated rimraf@2.7.1: Rimraf versions prior to v4 are no longer supported
npm warn deprecated inflight@1.0.6: This module is not supported, and leaks memory. Do not use it. Check out lru-cache if you want a good and tested way to coalesce async requests by a key value, which is much more comprehensive and powerful.
npm warn deprecated glob@7.2.3: Glob versions prior to v9 are no longer supported

added 140 packages, and audited 141 packages in 1s

23 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities
npm notice
npm notice New major version of npm available! 10.9.2 -> 11.5.1
npm notice Changelog: https://github.com/npm/cli/releases/tag/v11.5.1
npm notice To update run: npm install -g npm@11.5.1
npm notice
```

1. the "test" npm command could be made to run "all tests" if no test is given, instead of now where it just errors
2. the main file of the `package.json` is "index.js" but should be "server.js"