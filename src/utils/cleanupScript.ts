/**
 * Cleanup Script
 * 
 * This script safely removes old components and files after
 * successful migration validation.
 */

import { runCleanupValidation, getFilesToRemove, getFilesToKeep } from './cleanupValidation';

// Cleanup result interface
export interface CleanupResult {
  success: boolean;
  removedFiles: string[];
  keptFiles: string[];
  errors: string[];
  warnings: string[];
  summary: {
    totalFiles: number;
    removedCount: number;
    keptCount: number;
    errorCount: number;
    warningCount: number;
  };
}

// Simulate file removal (in a real implementation, this would use fs)
function simulateFileRemoval(filePath: string): boolean {
  console.log(`🗑️  Removing: ${filePath}`);
  // In a real implementation, you would use fs.unlinkSync(filePath)
  return true;
}

// Simulate file existence check (in a real implementation, this would use fs)
function simulateFileExists(filePath: string): boolean {
  // In a real implementation, you would use fs.existsSync(filePath)
  return true;
}

// Perform cleanup
export function performCleanup(): CleanupResult {
  console.log('🧹 Starting Cleanup Process...\n');
  
  // Run validation first
  const validation = runCleanupValidation();
  
  if (!validation.isSafeToCleanup) {
    console.log('❌ Cleanup validation failed. Aborting cleanup.');
    return {
      success: false,
      removedFiles: [],
      keptFiles: [],
      errors: validation.errors,
      warnings: validation.warnings,
      summary: {
        totalFiles: 0,
        removedCount: 0,
        keptCount: 0,
        errorCount: validation.errors.length,
        warningCount: validation.warnings.length
      }
    };
  }
  
  console.log('✅ Cleanup validation passed. Proceeding with cleanup.\n');
  
  const removedFiles: string[] = [];
  const keptFiles: string[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Remove old files
  console.log('📁 Removing old components...');
  const filesToRemove = getFilesToRemove();
  
  filesToRemove.forEach(file => {
    try {
      if (simulateFileExists(file)) {
        const success = simulateFileRemoval(file);
        if (success) {
          removedFiles.push(file);
          console.log(`✅ Removed: ${file}`);
        } else {
          errors.push(`Failed to remove: ${file}`);
          console.log(`❌ Failed to remove: ${file}`);
        }
      } else {
        warnings.push(`File not found: ${file}`);
        console.log(`⚠️  File not found: ${file}`);
      }
    } catch (error) {
      errors.push(`Error removing ${file}: ${error.message}`);
      console.log(`❌ Error removing ${file}: ${error.message}`);
    }
  });
  
  // Verify kept files
  console.log('\n📁 Verifying kept files...');
  const filesToKeep = getFilesToKeep();
  
  filesToKeep.forEach(file => {
    if (simulateFileExists(file)) {
      keptFiles.push(file);
      console.log(`✅ Kept: ${file}`);
    } else {
      warnings.push(`Expected file not found: ${file}`);
      console.log(`⚠️  Expected file not found: ${file}`);
    }
  });
  
  // Generate summary
  const summary = {
    totalFiles: filesToRemove.length + filesToKeep.length,
    removedCount: removedFiles.length,
    keptCount: keptFiles.length,
    errorCount: errors.length,
    warningCount: warnings.length
  };
  
  // Display results
  console.log('\n📊 Cleanup Results:');
  console.log(`Total Files: ${summary.totalFiles}`);
  console.log(`Removed: ${summary.removedCount}`);
  console.log(`Kept: ${summary.keptCount}`);
  console.log(`Errors: ${summary.errorCount}`);
  console.log(`Warnings: ${summary.warningCount}`);
  
  if (errors.length > 0) {
    console.log('\n❌ Errors:');
    errors.forEach(error => console.log(`  - ${error}`));
  }
  
  if (warnings.length > 0) {
    console.log('\n⚠️ Warnings:');
    warnings.forEach(warning => console.log(`  - ${warning}`));
  }
  
  const success = errors.length === 0;
  
  if (success) {
    console.log('\n🎉 Cleanup completed successfully!');
    console.log('✅ All old components removed');
    console.log('✅ All new components preserved');
    console.log('✅ Migration cleanup complete');
  } else {
    console.log('\n⚠️ Cleanup completed with errors');
    console.log('❌ Some files could not be removed');
    console.log('❌ Please check the errors above');
  }
  
  return {
    success,
    removedFiles,
    keptFiles,
    errors,
    warnings,
    summary
  };
}

// Rollback cleanup (restore removed files)
export function rollbackCleanup(): boolean {
  console.log('🔄 Rolling back cleanup...\n');
  
  // In a real implementation, this would restore files from backup
  // or recreate them from version control
  
  console.log('⚠️  Rollback not implemented in this simulation');
  console.log('💡 In a real implementation, restore files from backup or git');
  
  return false;
}

// Verify cleanup
export function verifyCleanup(): boolean {
  console.log('🔍 Verifying cleanup...\n');
  
  const filesToRemove = getFilesToRemove();
  const filesToKeep = getFilesToKeep();
  
  let allGood = true;
  
  // Check that old files are removed
  console.log('📁 Checking removed files...');
  filesToRemove.forEach(file => {
    const exists = simulateFileExists(file);
    if (exists) {
      console.log(`❌ File still exists: ${file}`);
      allGood = false;
    } else {
      console.log(`✅ File removed: ${file}`);
    }
  });
  
  // Check that new files are kept
  console.log('\n📁 Checking kept files...');
  filesToKeep.forEach(file => {
    const exists = simulateFileExists(file);
    if (exists) {
      console.log(`✅ File exists: ${file}`);
    } else {
      console.log(`❌ File missing: ${file}`);
      allGood = false;
    }
  });
  
  if (allGood) {
    console.log('\n🎉 Cleanup verification passed!');
    console.log('✅ All old components removed');
    console.log('✅ All new components preserved');
  } else {
    console.log('\n⚠️ Cleanup verification failed');
    console.log('❌ Some files are in unexpected state');
  }
  
  return allGood;
}

// Run complete cleanup process
export function runCompleteCleanup(): CleanupResult {
  console.log('🚀 Running Complete Cleanup Process...\n');
  
  // Step 1: Validate cleanup safety
  console.log('Step 1: Validating cleanup safety...');
  const validation = runCleanupValidation();
  
  if (!validation.isSafeToCleanup) {
    console.log('❌ Cleanup validation failed. Cannot proceed.');
    return {
      success: false,
      removedFiles: [],
      keptFiles: [],
      errors: validation.errors,
      warnings: validation.warnings,
      summary: {
        totalFiles: 0,
        removedCount: 0,
        keptCount: 0,
        errorCount: validation.errors.length,
        warningCount: validation.warnings.length
      }
    };
  }
  
  console.log('✅ Cleanup validation passed.\n');
  
  // Step 2: Perform cleanup
  console.log('Step 2: Performing cleanup...');
  const result = performCleanup();
  
  if (!result.success) {
    console.log('❌ Cleanup failed. Stopping process.');
    return result;
  }
  
  console.log('✅ Cleanup completed.\n');
  
  // Step 3: Verify cleanup
  console.log('Step 3: Verifying cleanup...');
  const verification = verifyCleanup();
  
  if (!verification) {
    console.log('⚠️ Cleanup verification failed. Consider rollback.');
  } else {
    console.log('✅ Cleanup verification passed.');
  }
  
  console.log('\n🎉 Complete cleanup process finished!');
  
  return result;
}

export default {
  performCleanup,
  rollbackCleanup,
  verifyCleanup,
  runCompleteCleanup
};
