#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Frontend project configurations
const frontendProjects = {
  owner: {
    name: 'EcommerceByowner',
    path: path.join(__dirname, '../../EcommerceByowner'),
    buildCommand: 'npm run build',
    distPath: path.join(__dirname, '../../EcommerceByowner/dist'),
    description: 'Owner/Store Management Interface'
  },
  admin: {
    name: 'EcommerceByAdmin',
    path: path.join(__dirname, '../../EcommerceByAdmin'),
    buildCommand: 'npm run build',
    distPath: path.join(__dirname, '../../EcommerceByAdmin/dist'),
    description: 'Admin Management Interface'
  }
};

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logInfo(message) {
  log(`ℹ️ ${message}`, 'blue');
}

function logWarning(message) {
  log(`⚠️ ${message}`, 'yellow');
}

// Check if project exists and has package.json
function checkProject(project) {
  const packageJsonPath = path.join(project.path, 'package.json');
  const exists = fs.existsSync(project.path) && fs.existsSync(packageJsonPath);
  
  return {
    ...project,
    exists,
    packageJsonExists: fs.existsSync(packageJsonPath)
  };
}

// Build a single frontend project
function buildProject(projectKey) {
  const project = frontendProjects[projectKey];
  if (!project) {
    logError(`Project '${projectKey}' not found. Available projects: ${Object.keys(frontendProjects).join(', ')}`);
    return false;
  }

  const checkedProject = checkProject(project);
  
  if (!checkedProject.exists) {
    logError(`Project directory not found: ${project.path}`);
    return false;
  }

  if (!checkedProject.packageJsonExists) {
    logError(`package.json not found in: ${project.path}`);
    return false;
  }

  logInfo(`Building ${project.name}...`);
  logInfo(`Path: ${project.path}`);
  logInfo(`Command: ${project.buildCommand}`);

  try {
    // Change to project directory
    process.chdir(project.path);
    
    // Install dependencies if node_modules doesn't exist
    if (!fs.existsSync(path.join(project.path, 'node_modules'))) {
      logInfo('Installing dependencies...');
      execSync('npm install', { stdio: 'inherit' });
    }

    // Build the project
    logInfo('Building project...');
    execSync(project.buildCommand, { stdio: 'inherit' });

    // Check if dist folder was created
    if (fs.existsSync(project.distPath)) {
      logSuccess(`${project.name} built successfully!`);
      logInfo(`Dist folder: ${project.distPath}`);
      return true;
    } else {
      logError(`Build completed but dist folder not found: ${project.distPath}`);
      return false;
    }
  } catch (error) {
    logError(`Failed to build ${project.name}: ${error.message}`);
    return false;
  }
}

// Build all frontend projects
function buildAll() {
  logInfo('Building all frontend projects...');
  
  const results = {};
  let successCount = 0;
  let totalCount = 0;

  Object.entries(frontendProjects).forEach(([key, project]) => {
    totalCount++;
    logInfo(`\n--- Building ${project.name} ---`);
    
    const success = buildProject(key);
    results[key] = success;
    
    if (success) {
      successCount++;
    }
  });

  // Summary
  logInfo('\n--- Build Summary ---');
  Object.entries(results).forEach(([key, success]) => {
    const project = frontendProjects[key];
    const status = success ? '✅ SUCCESS' : '❌ FAILED';
    log(`${project.name}: ${status}`, success ? 'green' : 'red');
  });

  logInfo(`\nBuild completed: ${successCount}/${totalCount} projects successful`);
  
  if (successCount === totalCount) {
    logSuccess('All projects built successfully!');
  } else {
    logWarning('Some projects failed to build. Check the errors above.');
  }

  return results;
}

// Check build status
function checkBuildStatus() {
  logInfo('Checking build status...');
  
  Object.entries(frontendProjects).forEach(([key, project]) => {
    const distExists = fs.existsSync(project.distPath);
    const indexExists = fs.existsSync(path.join(project.distPath, 'index.html'));
    
    logInfo(`\n--- ${project.name} ---`);
    logInfo(`Path: ${project.path}`);
    logInfo(`Dist folder: ${distExists ? '✅ Exists' : '❌ Not found'}`);
    logInfo(`Index.html: ${indexExists ? '✅ Exists' : '❌ Not found'}`);
    
    if (distExists && indexExists) {
      logSuccess(`${project.name} is ready to serve!`);
    } else {
      logWarning(`${project.name} needs to be built.`);
    }
  });
}

// Main function
function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  logInfo('Frontend Build Manager');
  logInfo('=====================');

  switch (command) {
    case 'build':
      const projectKey = args[1];
      if (projectKey) {
        buildProject(projectKey);
      } else {
        buildAll();
      }
      break;
      
    case 'check':
      checkBuildStatus();
      break;
      
    case 'list':
      logInfo('Available projects:');
      Object.entries(frontendProjects).forEach(([key, project]) => {
        logInfo(`  ${key}: ${project.name} - ${project.description}`);
      });
      break;
      
    default:
      logInfo('Usage:');
      logInfo('  node build-frontend.js build [project]  - Build specific project or all projects');
      logInfo('  node build-frontend.js check            - Check build status of all projects');
      logInfo('  node build-frontend.js list             - List available projects');
      logInfo('');
      logInfo('Available projects:');
      Object.entries(frontendProjects).forEach(([key, project]) => {
        logInfo(`  ${key}: ${project.name}`);
      });
      break;
  }
}

// Run the script
main(); 