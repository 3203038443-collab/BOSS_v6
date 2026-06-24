# BOSS_v6 GitHub Setup Script
# 1. Install Git from: https://git-scm.com/download/win
# 2. Run this script in PowerShell (right-click "Run with PowerShell")
Write-Host "BOSS直聘助手 v6.0 - GitHub Backup" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan

cd "$env:USERPROFILE\Desktop\BOSS_v6"

# Initialize repo
git init
git add .
git commit -m "Initial commit: BOSS直聘助手 v6.0"

# Create GitHub repo and push
Write-Host "
Next steps:" -ForegroundColor Yellow
Write-Host "1. Go to https://github.com/new" -ForegroundColor Yellow
Write-Host "2. Create a new repo named 'BOSS_v6'" -ForegroundColor Yellow
Write-Host "3. DO NOT add README, .gitignore, or license" -ForegroundColor Yellow
Write-Host "4. Run these two commands:" -ForegroundColor Yellow
Write-Host "   git remote add origin https://github.com/YOUR_USERNAME/BOSS_v6.git" -ForegroundColor White
Write-Host "   git push -u origin main" -ForegroundColor White
