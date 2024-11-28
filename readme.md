# Yule Log Tool

## Purpose

Often when investigating software problems you will need to analyze a lot of logs files. It can be useful to quickly see where the errors are in these files and also when they happened to get a feel for what may be causing an issue. 

> Currently limitations on folder format and log types!

## Disclaimer

This tool was built with a lot of AI assistance and therefore is designed to be used as a reference to build your own version. This tool is not designed to be used in production environments. 

## Features

- Upload of ZIP containing log files split into folders
- Filter logs based on folders
- Use daily summary graph to filter logs for that day

## Running the tool

You can run the tool in docker like this:

```
docker run -d -p 3000:3000 keithhubner/yule:1.0.0
```

Then access the tool on http://localhost:3000

## Using the tool

The tool will allow you to upload a ZIP file of logs. You can then extract these logs for analysis.

