#!/usr/bin/env node
'use strict';

const { spawn } = require('child_process');
const path = require('path');
const electron = require('electron');

const appPath = path.join(__dirname, '..', 'main.js');
const args = ['--no-sandbox', appPath].concat(process.argv.slice(2));

const proc = spawn(electron, args, { stdio: 'inherit', windowsHide: false });
proc.on('close', (code) => process.exit(code ?? 0));
