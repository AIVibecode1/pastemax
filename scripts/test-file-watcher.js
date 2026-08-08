#!/usr/bin/env node

/**
 * Test script for file watcher functionality
 * Run this script in a directory being watched by PasteMax to test auto-update
 */

const fs = require('fs');
const path = require('path');

const testDir = process.cwd();
console.log(`Running file watcher tests in: ${testDir}`);
console.log('Make sure PasteMax is running and watching this directory!\n');

// Helper function to wait
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Helper function to create a test file
function createTestFile(filename, content) {
  const filePath = path.join(testDir, filename);
  fs.writeFileSync(filePath, content);
  console.log(`✅ Created: ${filename}`);
  return filePath;
}

// Helper function to modify a file
function modifyFile(filename, additionalContent) {
  const filePath = path.join(testDir, filename);
  fs.appendFileSync(filePath, `\n${additionalContent}`);
  console.log(`✏️  Modified: ${filename}`);
}

// Helper function to delete a file
function deleteFile(filename) {
  const filePath = path.join(testDir, filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    console.log(`🗑️  Deleted: ${filename}`);
  }
}

// Main test sequence
async function runTests() {
  console.log('Starting file watcher tests...\n');

  // Test 1: File Addition
  console.log('📝 Test 1: File Addition');
  createTestFile('watcher-test-1.txt', 'Initial content for test file 1');
  await wait(2000);

  // Test 2: File Modification
  console.log('\n✏️  Test 2: File Modification');
  modifyFile('watcher-test-1.txt', 'This is additional content to test file updates');
  await wait(2000);

  // Test 3: Multiple File Creation
  console.log('\n📝 Test 3: Multiple File Creation');
  for (let i = 2; i <= 5; i++) {
    createTestFile(`watcher-test-${i}.txt`, `Content for test file ${i}`);
    await wait(500);
  }
  await wait(2000);

  // Test 4: Rapid Modifications (Testing Debounce)
  console.log('\n⚡ Test 4: Rapid Modifications (Testing Debounce)');
  for (let i = 1; i <= 5; i++) {
    modifyFile('watcher-test-2.txt', `Rapid change ${i}`);
    await wait(100); // Very short delay to test debouncing
  }
  await wait(2000);

  // Test 5: Directory Creation with Files
  console.log('\n📁 Test 5: Directory Creation with Files');
  const testDirPath = path.join(testDir, 'watcher-test-dir');
  if (!fs.existsSync(testDirPath)) {
    fs.mkdirSync(testDirPath);
    console.log('✅ Created directory: watcher-test-dir');
  }
  createTestFile('watcher-test-dir/nested-file-1.txt', 'Nested file content 1');
  createTestFile('watcher-test-dir/nested-file-2.txt', 'Nested file content 2');
  await wait(2000);

  // Test 6: File Deletion
  console.log('\n🗑️  Test 6: File Deletion');
  deleteFile('watcher-test-3.txt');
  deleteFile('watcher-test-4.txt');
  await wait(2000);

  // Test 7: Directory Deletion
  console.log('\n🗑️  Test 7: Directory Deletion');
  if (fs.existsSync(testDirPath)) {
    fs.rmSync(testDirPath, { recursive: true });
    console.log('🗑️  Deleted directory: watcher-test-dir');
  }
  await wait(2000);

  // Cleanup
  console.log('\n🧹 Cleaning up remaining test files...');
  for (let i = 1; i <= 5; i++) {
    deleteFile(`watcher-test-${i}.txt`);
  }

  console.log('\n✅ All tests completed!');
  console.log('Check PasteMax console for watcher events and UI for updates.');
}

// Run tests
runTests().catch(console.error);
